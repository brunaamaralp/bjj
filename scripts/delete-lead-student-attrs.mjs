/**
 * Remove atributos de ALUNO da coleção `leads` (pós-migração para `students`).
 *
 * Uso:
 *   npm run cleanup:lead-student-attrs          # dry-run (padrão)
 *   DRY_RUN=0 CONFIRM=1 npm run cleanup:lead-student-attrs
 *
 * Requer: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, DB_ID,
 *         VITE_APPWRITE_LEADS_COLLECTION_ID (ou APPWRITE_LEADS_COLLECTION_ID)
 *
 * Opcional:
 *   DRY_RUN=0 — executa deleções (ainda exige CONFIRM=1)
 *   CONFIRM=1 — obrigatório para apagar de verdade
 *   EXTRA_KEYS=plan,turma — vírgula: apaga chaves extras se existirem
 */

import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function applyEnvFile(relPath, { override } = { override: false }) {
  try {
    const p = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf-8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const DRY_RUN = !['0', 'false', 'no'].includes(String(process.env.DRY_RUN ?? '1').trim().toLowerCase());
const CONFIRM = ['1', 'true', 'yes'].includes(String(process.env.CONFIRM || '').trim().toLowerCase());

/** Atributos que passaram a viver só em `students` (não usar mais em leads). */
const STUDENT_ONLY_ATTR_KEYS = new Set([
  'contact_type',
  'student_status',
  'exit_reason',
  'exit_date',
  'plan',
  'enrollmentDate',
  'enrollment_date',
  'converted_at',
  'due_day',
  'dueDay',
  'turma',
  'class_name',
  'className',
  'emergencyContact',
  'emergency_contact',
  'emergencyPhone',
  'emergency_phone',
  'preferred_payment_method',
  'preferred_payment_account',
  'cpf',
  'responsavel',
  'cpf_responsavel',
  'cpfResponsavel',
  'device_id',
  'controlid_user_id',
  'controlid_synced',
  'controlid_sync_error',
  'photo_url',
  'photoUrl',
  'plan_billing',
  'planBilling',
  'freeze_start',
  'freeze_end',
  'freeze_status',
  'freeze_days_used',
  'freeze_quota_year',
  'last_birthday_sent',
  'source_origin',
]);

/** Atributos que o funil ainda usa — nunca apagar. */
const LEADS_KEEP_ATTR_KEYS = new Set([
  'name',
  'phone',
  'type',
  'origin',
  'status',
  'academyId',
  'pipeline_stage',
  'scheduledDate',
  'scheduledTime',
  'parentName',
  'age',
  'birth_date',
  'birthDate',
  'sexo',
  'lostReason',
  'lost_at',
  'attended_at',
  'missed_at',
  'missed_reason',
  'notes',
  'is_first_experience',
  'belt',
  'custom_answers_json',
  'label_ids',
  'whatsapp_intention',
  'whatsapp_priority',
  'whatsapp_lead_quente',
  'need_human',
  'pending_automations',
  'has_pending_automations',
  'status_changed_at',
  'pipeline_stage_changed_at',
  'last_note_at',
  'last_whatsapp_activity_at',
  'whatsapp_classified_at',
  'imported_at',
]);

async function listCollectionAttributes(databases, collectionId) {
  const res = await databases.listAttributes(DB_ID, collectionId);
  return res.attributes || [];
}

function keysToDelete(extraKeysRaw) {
  const keys = new Set(STUDENT_ONLY_ATTR_KEYS);
  for (const k of String(extraKeysRaw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    keys.add(k);
  }
  return keys;
}

async function deleteOneAttribute(databases, collectionId, attr) {
  const key = attr.key;
  if (attr.status && !['available', 'failed'].includes(String(attr.status))) {
    throw new Error(`atributo_nao_disponivel:status=${attr.status}`);
  }
  if (typeof databases.deleteAttribute !== 'function') {
    throw new Error('SDK sem deleteAttribute — atualize node-appwrite');
  }
  await databases.deleteAttribute(DB_ID, collectionId, key);
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    console.error('Faltam variáveis (endpoint, project, API key, DB, LEADS_COL).');
    process.exit(1);
  }

  const deleteKeys = keysToDelete(process.env.EXTRA_KEYS);
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('Coleção leads:', LEADS_COL);
  console.log(DRY_RUN ? '[DRY_RUN] Nenhum atributo será apagado.\n' : '[EXECUÇÃO] Deletando atributos...\n');

  if (!DRY_RUN && !CONFIRM) {
    console.error('Para apagar de verdade: DRY_RUN=0 CONFIRM=1 npm run cleanup:lead-student-attrs');
    process.exit(1);
  }

  let attributes;
  try {
    attributes = await listCollectionAttributes(databases, LEADS_COL);
  } catch (e) {
    console.error('Não foi possível listar atributos:', e?.message || e);
    process.exit(1);
  }

  const candidates = attributes.filter((a) => {
    const key = String(a?.key || '').trim();
    if (!key || key.startsWith('$')) return false;
    if (LEADS_KEEP_ATTR_KEYS.has(key)) return false;
    return deleteKeys.has(key);
  });

  const skippedKeep = attributes.filter((a) => LEADS_KEEP_ATTR_KEYS.has(a.key));
  const unknownOnCollection = attributes.filter(
    (a) =>
      !LEADS_KEEP_ATTR_KEYS.has(a.key) &&
      !deleteKeys.has(a.key) &&
      !String(a.key || '').startsWith('$')
  );

  if (candidates.length === 0) {
    console.log('Nenhum atributo candidato encontrado na coleção (já limpo ou nomes diferentes).');
    console.log('\nAtributos na coleção que NÃO estão na lista de remoção:');
    for (const a of unknownOnCollection) {
      console.log(`  ? ${a.key} (${a.type}, status=${a.status || '?'})`);
    }
    return;
  }

  console.log(`Serão removidos (${candidates.length}):\n`);
  for (const a of candidates) {
    console.log(`  - ${a.key} (${a.type}, status=${a.status || '?'})`);
  }

  if (unknownOnCollection.length) {
    console.log('\nOutros atributos na coleção (não removidos automaticamente):');
    for (const a of unknownOnCollection) {
      console.log(`  ? ${a.key} (${a.type})`);
    }
    console.log('  Use EXTRA_KEYS=chave1,chave2 para incluir na remoção.\n');
  }

  console.log('\nMantidos explicitamente (%d chaves na allowlist do funil).\n', skippedKeep.length);

  let deleted = 0;
  let errors = 0;

  for (const attr of candidates) {
    if (DRY_RUN) {
      deleted += 1;
      continue;
    }
    try {
      await deleteOneAttribute(databases, LEADS_COL, attr);
      console.log(`  ✓ removido: ${attr.key}`);
      deleted += 1;
      await sleep(400);
    } catch (e) {
      errors += 1;
      console.error(`  ✗ ${attr.key}:`, e?.message || e);
    }
  }

  console.log('\n--- Resumo ---');
  console.log(DRY_RUN ? 'Seriam removidos:' : 'Removidos:', deleted);
  console.log('Erros:', errors);
  if (!DRY_RUN) {
    console.log('\nAguarde os atributos sumirem do Console (status "deleting") antes de novas alterações.');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
