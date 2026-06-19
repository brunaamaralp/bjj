/**
 * Cron — gera class_slots para todas as academias com schedules ativos.
 */
import { Query } from 'node-appwrite';
import { parseAcademySettings } from '../controlidSettings.js';
import { generateSlotsForAcademy } from './classSlotGenerator.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

async function listAllAcademies(databases, dbId) {
  if (!ACADEMIES_COL) return [];
  const out = [];
  let cursor = null;
  for (;;) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, ACADEMIES_COL, q);
    for (const d of res.documents || []) {
      if (d?.$id) out.push(d);
    }
    if (!res.documents || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return out;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 */
export async function runClassSlotsCron(databases, dbId) {
  const academies = await listAllAcademies(databases, dbId);
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const details = [];

  for (const academy of academies) {
    const settings = parseAcademySettings(academy.settings);
    const out = await generateSlotsForAcademy(databases, dbId, academy.$id, {
      academySettings: settings,
    });
    totalCreated += out.created || 0;
    totalSkipped += out.skipped || 0;
    totalErrors += out.errors || 0;
    if ((out.created || 0) > 0 || (out.errors || 0) > 0) {
      details.push(out);
    }
  }

  return {
    academies: academies.length,
    created: totalCreated,
    skipped: totalSkipped,
    errors: totalErrors,
    details: details.slice(0, 20),
  };
}
