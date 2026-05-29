import { Client, Databases } from 'node-appwrite';
import {
  DEFAULT_CONTRACT_TEMPLATE_HTML,
  DEFAULT_RESCISSION_TEMPLATE_HTML,
} from './contractVariables.js';
import { defaultContractSignerLayout, serializeContractSignerLayout } from './contractSignerLayout.js';
import { migrateFinanceConfigPlanTemplates } from './migrateFinancePlanContractTemplates.js';
import {
  createContractTemplate,
  isContractTemplatesConfigured,
  listContractTemplates,
  type ContractTemplateRecord,
} from './contractTemplateService.js';
import { parseContractTemplatePurpose, type ContractTemplatePurpose } from './contractTemplatePurpose.js';
import { API_KEY, DB_ID, ENDPOINT, PROJECT_ID } from '../server/appwriteCollections.js';

const ACADEMIES_COL = () =>
  String(
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
      process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
      ''
  ).trim();

type FinanceConfigLike = {
  plans?: Array<{
    name?: string;
    contractTemplateId?: string;
    rescissionTemplateId?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type EnsureAcademyContractSetupResult = {
  templatesCreated: ContractTemplatePurpose[];
  plansLinked: number;
  financeConfigUpdated: boolean;
  templates: ContractTemplateRecord[];
  financeConfig: FinanceConfigLike;
};

let cachedDb: Databases | null = null;

function requireDb(): Databases {
  if (!PROJECT_ID || !API_KEY || !DB_ID) throw new Error('contract_store_not_configured');
  if (!cachedDb) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    cachedDb = new Databases(client);
  }
  return cachedDb;
}

function parseFinanceConfig(raw: unknown): FinanceConfigLike {
  if (!raw) return { plans: [] };
  try {
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return cfg && typeof cfg === 'object' ? (cfg as FinanceConfigLike) : { plans: [] };
  } catch {
    return { plans: [] };
  }
}

function templatesForPurpose(
  templates: ContractTemplateRecord[],
  purpose: ContractTemplatePurpose
): ContractTemplateRecord[] {
  return templates.filter((t) => t.active && parseContractTemplatePurpose(t.purpose) === purpose);
}

function pickDefaultTemplate(
  templates: ContractTemplateRecord[],
  purpose: ContractTemplatePurpose
): ContractTemplateRecord | null {
  const scoped = templatesForPurpose(templates, purpose);
  return scoped.find((t) => t.isDefault) || scoped[0] || null;
}

function applyDefaultPlanContractLinks(
  financeConfig: FinanceConfigLike,
  templates: ContractTemplateRecord[]
): { config: FinanceConfigLike; changed: boolean; plansLinked: number } {
  const defEnroll = pickDefaultTemplate(templates, 'enrollment');
  const defRescind = pickDefaultTemplate(templates, 'rescission');
  const plans = [...(financeConfig.plans || [])];
  let changed = false;
  let plansLinked = 0;

  for (const plan of plans) {
    const name = String(plan.name || '').trim();
    if (!name) continue;
    let touched = false;
    if (defEnroll && !String(plan.contractTemplateId || '').trim()) {
      plan.contractTemplateId = defEnroll.$id;
      touched = true;
      changed = true;
    }
    if (defRescind && !String(plan.rescissionTemplateId || '').trim()) {
      plan.rescissionTemplateId = defRescind.$id;
      touched = true;
      changed = true;
    }
    if (touched) plansLinked += 1;
  }

  if (!changed) return { config: financeConfig, changed: false, plansLinked: 0 };
  return { config: { ...financeConfig, plans }, changed: true, plansLinked };
}

/**
 * Garante modelos padrão (matrícula + rescisão), migra vínculos legados e aplica defaults nos planos.
 */
export async function ensureAcademyContractSetup(
  academyId: string
): Promise<EnsureAcademyContractSetupResult> {
  if (!isContractTemplatesConfigured()) throw new Error('contract_templates_not_configured');
  const col = ACADEMIES_COL();
  if (!col) throw new Error('academies_collection_not_configured');

  const databases = requireDb();
  const academyDoc = await databases.getDocument(DB_ID, col, String(academyId));
  let financeConfig = parseFinanceConfig(academyDoc.financeConfig);

  let templates = await listContractTemplates(academyId);
  const templatesCreated: ContractTemplatePurpose[] = [];
  const layoutJson = serializeContractSignerLayout(defaultContractSignerLayout());

  if (!pickDefaultTemplate(templates, 'enrollment')) {
    const created = await createContractTemplate({
      academy_id: academyId,
      name: 'Contrato de matrícula padrão',
      description: 'Criado automaticamente — revise o texto em Contratos → Modelos.',
      purpose: 'enrollment',
      is_default: true,
      body_html: DEFAULT_CONTRACT_TEMPLATE_HTML,
      signer_layout_json: layoutJson,
    });
    templates = [...templates, created];
    templatesCreated.push('enrollment');
  }

  if (!pickDefaultTemplate(templates, 'rescission')) {
    const created = await createContractTemplate({
      academy_id: academyId,
      name: 'Termo de rescisão padrão',
      description: 'Criado automaticamente — revise o texto em Contratos → Modelos.',
      purpose: 'rescission',
      is_default: true,
      body_html: DEFAULT_RESCISSION_TEMPLATE_HTML,
      signer_layout_json: layoutJson,
    });
    templates = [...templates, created];
    templatesCreated.push('rescission');
  }

  const migrated = migrateFinanceConfigPlanTemplates(financeConfig, templates);
  financeConfig = migrated.config;

  const linked = applyDefaultPlanContractLinks(financeConfig, templates);
  financeConfig = linked.config;

  const financeConfigUpdated = migrated.changed || linked.changed;
  if (financeConfigUpdated) {
    await databases.updateDocument(DB_ID, col, String(academyId), {
      financeConfig: JSON.stringify(financeConfig),
    });
  }

  templates = await listContractTemplates(academyId);

  return {
    templatesCreated,
    plansLinked: linked.plansLinked,
    financeConfigUpdated,
    templates,
    financeConfig,
  };
}
