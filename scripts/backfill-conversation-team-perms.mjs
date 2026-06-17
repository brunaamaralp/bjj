/**
 * Backfill: adiciona permissões read/update/delete do team da academia em conversas
 * que só têm permissão do owner (ou nenhuma team).
 *
 * Uso:
 *   node scripts/backfill-conversation-team-perms.mjs              # dry-run
 *   node scripts/backfill-conversation-team-perms.mjs --apply
 *   node scripts/backfill-conversation-team-perms.mjs --apply --academy-id=ABC
 */

import { Client, Databases, Permission, Query, Role } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

try {
  const p = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf-8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const k = m[1];
        let v = m[2];
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        if (!(k in process.env)) process.env[k] = v;
      }
    });
  }
} catch {}

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.APPWRITE_ACADEMIES_COLLECTION_ID || process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || '';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const academyArg = args.find((a) => a.startsWith('--academy-id='));
const academyFilter = academyArg ? academyArg.split('=').slice(1).join('=').trim() : '';

const PAGE = 100;

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) {
    perms.push(
      Permission.read(Role.user(ownerId)),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId))
    );
  }
  if (teamId) {
    perms.push(
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId)),
      Permission.delete(Role.team(teamId))
    );
  }
  return perms;
}

function permsIncludeTeam(existingPerms, teamId) {
  const needle = `team:${teamId}`;
  return (existingPerms || []).some((p) => String(p).includes(needle));
}

async function main() {
  if (!API_KEY || !PROJECT_ID || !DB_ID || !CONVERSATIONS_COL || !ACADEMIES_COL) {
    console.error('Config Appwrite ausente. Verifique .env (API_KEY, DB, CONVERSATIONS, ACADEMIES).');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  /** @type {Map<string, object|null>} */
  const academyCache = new Map();

  async function getAcademy(academyId) {
    const id = String(academyId || '').trim();
    if (!id) return null;
    if (academyCache.has(id)) return academyCache.get(id);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
      academyCache.set(id, doc);
      return doc;
    } catch {
      academyCache.set(id, null);
      return null;
    }
  }

  let cursor = null;
  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  let skippedNoTeam = 0;
  let errors = 0;

  console.log(apply ? 'Modo APPLY — gravando permissões' : 'Modo DRY-RUN — nenhuma gravação');

  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderAsc('$createdAt')];
    if (academyFilter) queries.unshift(Query.equal('academy_id', [academyFilter]));
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
    const docs = page.documents || [];
    if (docs.length === 0) break;

    for (const doc of docs) {
      scanned++;
      const academyId = String(doc.academy_id || '').trim();
      if (!academyId) continue;

      const academy = await getAcademy(academyId);
      const teamId = String(academy?.teamId || '').trim();
      if (!teamId) {
        skippedNoTeam++;
        continue;
      }

      if (permsIncludeTeam(doc.$permissions, teamId)) continue;

      const nextPerms = permissionsForAcademyDoc(academy);
      if (nextPerms.length === 0) continue;

      needsUpdate++;
      console.log(
        `  ${doc.$id} academy=${academyId} phone=${doc.phone_number || '?'} → +team(${teamId})`
      );

      if (apply) {
        try {
          await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {}, nextPerms);
          updated++;
        } catch (e) {
          errors++;
          console.error(`    ❌ ${e?.message || e}`);
        }
      }
    }

    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1].$id;
  }

  console.log('');
  console.log(
    `Scanned: ${scanned}, needs update: ${needsUpdate}, updated: ${updated}, ` +
      `skipped (sem teamId): ${skippedNoTeam}, errors: ${errors}`
  );
  if (!apply && needsUpdate > 0) {
    console.log('Execute com --apply para persistir.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
