import { Client, Databases } from 'node-appwrite';
import { type ContractVariableMap } from './contractVariables.js';
import { mapLeadDocToContractVariables } from './leadContractVariables.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = () =>
  String(
    process.env.APPWRITE_LEADS_COLLECTION_ID || process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || ''
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

export async function buildContractVariableMap(input: {
  academyId: string;
  leadId?: string;
}): Promise<ContractVariableMap> {
  let academyName = '';
  const db = getDb();

  if (db && ACADEMIES_COL()) {
    try {
      const academy = await db.getDocument(DB_ID, ACADEMIES_COL(), String(input.academyId));
      academyName = String(academy.name || academy.academy_name || '').trim();
    } catch {
      void 0;
    }
  }

  const leadId = String(input.leadId || '').trim();
  if (!leadId || !db || !LEADS_COL()) {
    return mapLeadDocToContractVariables(null, academyName);
  }

  try {
    const lead = await db.getDocument(DB_ID, LEADS_COL(), leadId);
    return mapLeadDocToContractVariables(lead as Record<string, unknown>, academyName);
  } catch {
    return mapLeadDocToContractVariables(null, academyName);
  }
}
