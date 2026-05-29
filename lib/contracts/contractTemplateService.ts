import { Client, Databases, Query, ID, type Models } from 'node-appwrite';
import { Permission, Role } from 'node-appwrite';
import {
  buildTemplateFileViewUrl,
  deleteTemplateFile,
  downloadTemplatePdf,
  isContractTemplateStorageConfigured,
  uploadTemplatePdf,
} from './contractTemplateStorage.js';
import { API_KEY, DB_ID, ENDPOINT, PROJECT_ID } from '../server/appwriteCollections.js';
import {
  defaultContractSignerLayout,
  parseContractSignerLayout,
  serializeContractSignerLayout,
  type ContractSignerLayout,
} from './contractSignerLayout.js';

const TEMPLATES_COL = () =>
  String(process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || '').trim();

let cachedDb: Databases | null = null;

function requireDb(): Databases {
  if (!PROJECT_ID || !API_KEY || !DB_ID) throw new Error('contract_store_not_configured');
  if (!TEMPLATES_COL()) throw new Error('contract_templates_collection_not_configured');
  if (!cachedDb) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    cachedDb = new Databases(client);
  }
  return cachedDb;
}

export function isContractTemplatesConfigured(): boolean {
  return Boolean(PROJECT_ID && API_KEY && DB_ID && TEMPLATES_COL());
}

function docPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

export interface ContractTemplateRecord {
  $id: string;
  academyId: string;
  name: string;
  description: string | null;
  kind: string;
  bodyHtml: string | null;
  storageFileId: string | null;
  fileUrl: string | null;
  planNames: string[];
  isDefault: boolean;
  active: boolean;
  signerLayout: ContractSignerLayout;
  createdAt: string | null;
  updatedAt: string | null;
}

function parsePlanNames(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mapTemplateDoc(doc: Models.Document | null): ContractTemplateRecord | null {
  if (!doc) return null;
  return {
    $id: doc.$id,
    academyId: String(doc.academy_id || ''),
    name: String(doc.name || ''),
    description: doc.description ? String(doc.description) : null,
    kind: String(doc.kind || 'html_editor'),
    bodyHtml: doc.body_html ? String(doc.body_html) : null,
    storageFileId: doc.storage_file_id ? String(doc.storage_file_id) : null,
    fileUrl: doc.file_url ? String(doc.file_url) : null,
    planNames: parsePlanNames(doc.plan_names),
    isDefault: doc.is_default === true || doc.is_default === 'true',
    active: doc.active !== false && doc.active !== 'false',
    signerLayout: parseContractSignerLayout(doc.signer_layout_json),
    createdAt: doc.$createdAt ?? null,
    updatedAt: doc.$updatedAt ?? null,
  };
}

async function clearOtherDefaults(academyId: string, exceptId?: string) {
  const databases = requireDb();
  const list = await databases.listDocuments(DB_ID, TEMPLATES_COL(), [
    Query.equal('academy_id', [String(academyId)]),
    Query.equal('is_default', [true]),
    Query.limit(100),
  ]);
  for (const doc of list.documents || []) {
    if (exceptId && doc.$id === exceptId) continue;
    await databases.updateDocument(DB_ID, TEMPLATES_COL(), doc.$id, { is_default: false });
  }
}

export async function listContractTemplates(
  academyId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<ContractTemplateRecord[]> {
  const databases = requireDb();
  const queries = [
    Query.equal('academy_id', [String(academyId)]),
    Query.orderDesc('$createdAt'),
    Query.limit(100),
  ];
  if (opts.activeOnly) queries.unshift(Query.equal('active', [true]));

  const list = await databases.listDocuments(DB_ID, TEMPLATES_COL(), queries);
  return (list.documents || [])
    .map((d) => mapTemplateDoc(d))
    .filter((t): t is ContractTemplateRecord => Boolean(t));
}

export async function getContractTemplateById(
  id: string,
  academyId: string
): Promise<ContractTemplateRecord | null> {
  const databases = requireDb();
  try {
    const doc = await databases.getDocument(DB_ID, TEMPLATES_COL(), id);
    const mapped = mapTemplateDoc(doc);
    if (!mapped || mapped.academyId !== String(academyId)) return null;
    return mapped;
  } catch {
    return null;
  }
}

export async function getContractTemplatePdfBuffer(
  templateId: string,
  academyId: string,
  variableMap?: import('./contractVariables.js').ContractVariableMap
): Promise<{ buffer: Buffer; pageCount: number; template: ContractTemplateRecord }> {
  const template = await getContractTemplateById(templateId, academyId);
  if (!template) throw new Error('contract_template_not_found');
  if (!template.active) throw new Error('contract_template_inactive');

  const { mergeContractTemplateHtml } = await import('./contractVariables.js');
  const { renderContractHtmlToPdf, countPdfBufferPages } = await import('./renderContractHtmlToPdf.js');

  if (template.bodyHtml?.trim() || template.kind === 'html_editor') {
    const html = mergeContractTemplateHtml(
      template.bodyHtml || '',
      variableMap || { data_hoje: new Date().toLocaleDateString('pt-BR') }
    );
    const { buffer, pageCount } = await renderContractHtmlToPdf(html);
    if (!buffer.length) throw new Error('contract_template_render_empty');
    return { buffer, pageCount, template };
  }

  if (!template.storageFileId) throw new Error('contract_template_content_missing');
  const buffer = await downloadTemplatePdf(template.storageFileId);
  if (!buffer.length) throw new Error('contract_template_file_empty');
  const pageCount = await countPdfBufferPages(buffer);
  return { buffer, pageCount, template };
}

export function resolveTemplateIdForPlan(
  planName: string | null | undefined,
  templates: ContractTemplateRecord[],
  financePlans: Array<{ name?: string; contractTemplateId?: string }> = []
): string | null {
  const plan = String(planName || '').trim();
  if (!plan) {
    const def = templates.find((t) => t.active && t.isDefault);
    return def?.$id || null;
  }

  const fin = financePlans.find((p) => String(p.name || '').trim() === plan);
  const fromPlan = String(fin?.contractTemplateId || '').trim();
  if (fromPlan && templates.some((t) => t.$id === fromPlan && t.active)) return fromPlan;

  const linked = templates.find(
    (t) => t.active && t.planNames.some((n) => String(n).trim().toLowerCase() === plan.toLowerCase())
  );
  if (linked) return linked.$id;

  const def = templates.find((t) => t.active && t.isDefault);
  return def?.$id || null;
}

export async function createContractTemplate(input: {
  academy_id: string;
  name: string;
  description?: string;
  plan_names?: string[];
  is_default?: boolean;
  body_html: string;
  signer_layout_json?: string | ContractSignerLayout;
}): Promise<ContractTemplateRecord> {
  const databases = requireDb();
  const body = String(input.body_html || '').trim();
  if (!body) throw new Error('contract_template_body_required');

  if (input.is_default) await clearOtherDefaults(input.academy_id);

  const layout =
    typeof input.signer_layout_json === 'string'
      ? input.signer_layout_json
      : serializeContractSignerLayout(
          input.signer_layout_json || defaultContractSignerLayout()
        );

  const payload: Record<string, unknown> = {
    academy_id: String(input.academy_id),
    name: String(input.name || '').trim(),
    description: input.description ? String(input.description).slice(0, 500) : '',
    kind: 'html_editor',
    body_html: body.slice(0, 28000),
    signer_layout_json: layout.slice(0, 4096),
    plan_names: JSON.stringify(input.plan_names || []),
    is_default: Boolean(input.is_default),
    active: true,
  };

  const doc = await databases.createDocument(
    DB_ID,
    TEMPLATES_COL(),
    ID.unique(),
    payload,
    docPerms()
  );
  const mapped = mapTemplateDoc(doc);
  if (!mapped) throw new Error('contract_template_create_failed');
  return mapped;
}

export async function updateContractTemplate(
  id: string,
  academyId: string,
  patch: {
    name?: string;
    description?: string;
    plan_names?: string[];
    is_default?: boolean;
    active?: boolean;
    body_html?: string;
    signer_layout_json?: string | ContractSignerLayout;
  }
): Promise<ContractTemplateRecord | null> {
  const databases = requireDb();
  const current = await getContractTemplateById(id, academyId);
  if (!current) return null;

  if (patch.is_default) await clearOtherDefaults(academyId, id);

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.description !== undefined) data.description = String(patch.description).slice(0, 500);
  if (patch.plan_names !== undefined) data.plan_names = JSON.stringify(patch.plan_names);
  if (patch.is_default !== undefined) data.is_default = Boolean(patch.is_default);
  if (patch.active !== undefined) data.active = Boolean(patch.active);
  if (patch.body_html !== undefined) {
    data.body_html = String(patch.body_html).slice(0, 28000);
    data.kind = 'html_editor';
  }
  if (patch.signer_layout_json !== undefined) {
    const layout =
      typeof patch.signer_layout_json === 'string'
        ? patch.signer_layout_json
        : serializeContractSignerLayout(patch.signer_layout_json);
    data.signer_layout_json = layout.slice(0, 4096);
  }

  const doc = await databases.updateDocument(DB_ID, TEMPLATES_COL(), id, data);
  return mapTemplateDoc(doc);
}

export async function deleteContractTemplate(id: string, academyId: string): Promise<boolean> {
  const current = await getContractTemplateById(id, academyId);
  if (!current) return false;
  if (current.storageFileId) await deleteTemplateFile(current.storageFileId);
  const databases = requireDb();
  await databases.deleteDocument(DB_ID, TEMPLATES_COL(), id);
  return true;
}

export async function replaceContractTemplateFile(
  id: string,
  academyId: string,
  file: Buffer,
  filename?: string
): Promise<ContractTemplateRecord | null> {
  const current = await getContractTemplateById(id, academyId);
  if (!current) return null;
  if (current.storageFileId) await deleteTemplateFile(current.storageFileId);
  const { fileId, viewUrl } = await uploadTemplatePdf(file, filename || 'template.pdf');
  const databases = requireDb();
  const doc = await databases.updateDocument(DB_ID, TEMPLATES_COL(), id, {
    storage_file_id: fileId,
    file_url: viewUrl,
  });
  return mapTemplateDoc(doc);
}
