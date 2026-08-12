import { Client, Databases } from 'node-appwrite';
import { type ContractVariableMap } from './contractVariables.js';
import { mapLeadDocToContractVariables } from './leadContractVariables.js';
import { API_KEY, DB_ID, ENDPOINT, PROJECT_ID } from '../server/appwriteCollections.js';
const LEADS_COL = () =>
  String(
    process.env.APPWRITE_LEADS_COLLECTION_ID || process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || ''
  ).trim();
const STUDENTS_COL = () =>
  String(
    process.env.APPWRITE_STUDENTS_COLLECTION_ID || process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || ''
  ).trim();
const ACADEMIES_COL = () =>
  String(
    process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
      process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
      ''
  ).trim();

let cachedDb: Databases | null = null;

function getDb(): Databases | null {
  if (!PROJECT_ID || !API_KEY || !DB_ID) return null;
  if (!cachedDb) {
    cachedDb = new Databases(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
    );
  }
  return cachedDb;
}

function parseFinanceConfig(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export async function buildContractVariableMap(input: {
  academyId: string;
  leadId?: string;
}): Promise<ContractVariableMap> {
  let academyName = '';
  let financeConfig: Record<string, unknown> = {};
  const db = getDb();

  if (db && ACADEMIES_COL()) {
    try {
      const academy = await db.getDocument(DB_ID, ACADEMIES_COL(), String(input.academyId));
      academyName = String(academy.name || academy.academy_name || '').trim();
      financeConfig = parseFinanceConfig(academy.financeConfig ?? academy.finance_config);
    } catch {
      void 0;
    }
  }

  const leadId = String(input.leadId || '').trim();
  if (!leadId || !db) {
    return mapLeadDocToContractVariables(null, academyName, financeConfig);
  }

  const cols = [STUDENTS_COL(), LEADS_COL()].filter(Boolean);
  for (const col of cols) {
    try {
      const lead = await db.getDocument(DB_ID, col, leadId);
      return mapLeadDocToContractVariables(
        lead as Record<string, unknown>,
        academyName,
        financeConfig
      );
    } catch {
      /* try next */
    }
  }
  return mapLeadDocToContractVariables(null, academyName, financeConfig);
}
