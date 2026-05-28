/**
 * Verificação read-only: Appwrite (contratos) + variáveis Autentique.
 * Uso: node --env-file=.env scripts/verify-contracts-autentique.mjs
 */
import { Client, Databases, Storage } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(relPath, { override } = { override: false }) {
  try {
    const p = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(p)) return;
    fs.readFileSync(p, 'utf-8')
      .split(/\r?\n/)
      .forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        const k = m[1];
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (override || !(k in process.env)) process.env[k] = v;
      });
  } catch {
    void 0;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || '';

const ENV_CHECKS = [
  { key: 'APPWRITE_ENDPOINT', alt: ['VITE_APPWRITE_ENDPOINT'], required: true },
  { key: 'APPWRITE_PROJECT_ID', alt: ['APPWRITE_PROJECT', 'VITE_APPWRITE_PROJECT_ID'], required: true },
  { key: 'APPWRITE_API_KEY', alt: [], required: true, secret: true },
  { key: 'APPWRITE_DATABASE_ID', alt: ['VITE_APPWRITE_DATABASE_ID'], required: true },
  { key: 'APPWRITE_CONTRACTS_COLLECTION_ID', alt: [], required: true },
  { key: 'APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID', alt: [], required: true },
  { key: 'APPWRITE_CONTRACT_EVENTS_COLLECTION_ID', alt: [], required: true },
  { key: 'APPWRITE_WEBHOOK_LOGS_COLLECTION_ID', alt: [], required: true },
  { key: 'APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID', alt: [], required: true },
  { key: 'APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID', alt: [], required: false },
  { key: 'AUTENTIQUE_TOKEN', alt: ['AUTENTIQUE_API_TOKEN'], required: true, secret: true },
  { key: 'AUTENTIQUE_WEBHOOK_SECRET', alt: [], required: true, secret: true },
];

const COLLECTIONS = {
  contracts: {
    id: () => process.env.APPWRITE_CONTRACTS_COLLECTION_ID,
    required: ['academy_id', 'lead_id', 'template_id', 'name', 'status', 'sandbox', 'autentique_id', 'signers_links', 'expires_at', 'meta_status'],
  },
  contract_signers: {
    id: () => process.env.APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID,
    required: [
      'contract_id',
      'autentique_public_id',
      'autentique_document_id',
      'email',
      'name',
      'phone',
      'action',
      'delivery_method',
      'status',
      'signed_at',
    ],
  },
  contract_events: {
    id: () => process.env.APPWRITE_CONTRACT_EVENTS_COLLECTION_ID,
    required: ['contract_id', 'event_type', 'payload_json', 'autentique_event_id', 'autentique_document_id'],
  },
  webhook_logs: {
    id: () => process.env.APPWRITE_WEBHOOK_LOGS_COLLECTION_ID,
    required: ['raw_payload', 'signature_valid', 'processed', 'event_type', 'error'],
  },
  contract_templates: {
    id: () => process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || 'contract_templates',
    required: ['academy_id', 'name', 'description', 'kind', 'body_html', 'plan_names', 'is_default', 'active'],
  },
};

const issues = [];
const ok = [];

function report(status, msg) {
  const line = `${status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌'} ${msg}`;
  console.log(line);
  if (status === 'ok') ok.push(msg);
  else issues.push({ status, msg });
}

function resolveEnv(keys, alts = []) {
  for (const k of [keys, ...alts].flat()) {
    const v = String(process.env[k] || '').trim();
    if (v) return { key: k, value: v };
  }
  return null;
}

async function listAttrKeys(databases, collectionId) {
  const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
  const map = new Map();
  for (const a of res.attributes || []) {
    const status = String(a.status || '').toLowerCase();
    map.set(a.key, status === 'available' || status === 'enabled' ? 'ready' : status || 'unknown');
  }
  return map;
}

async function verifyAutentiqueToken(token) {
  const res = await fetch('https://api.autentique.com.br/v2/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { __typename }`,
    }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { ok: false, detail: `HTTP ${res.status}: ${data?.errors?.[0]?.message || text.slice(0, 120)}` };
  }
  if (data?.errors?.length) {
    return { ok: false, detail: data.errors[0]?.message || 'graphql_error' };
  }
  return { ok: true, detail: 'GraphQL respondeu' };
}

async function main() {
  console.log('══ Verificação Contratos + Autentique ══\n');

  console.log('--- Variáveis de ambiente ---');
  for (const spec of ENV_CHECKS) {
    const resolved = resolveEnv(spec.key, spec.alt || []);
    if (!resolved?.value) {
      if (spec.required) report('fail', `${spec.key} — ausente`);
      else report('warn', `${spec.key} — ausente (opcional)`);
      continue;
    }
    const label = spec.secret ? `${resolved.key}=*** (${resolved.value.length} chars)` : `${resolved.key}=${resolved.value}`;
    report('ok', label);
  }

  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.log('\n❌ Appwrite core incompleto — não é possível verificar coleções.');
    process.exit(2);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const storage = new Storage(client);

  console.log('\n--- Appwrite: conexão ---');
  try {
    await databases.get({ databaseId: DB_ID });
    report('ok', `Database acessível: ${DB_ID}`);
  } catch (e) {
    report('fail', `Database inacessível: ${e?.message || e}`);
    process.exit(2);
  }

  console.log('\n--- Appwrite: coleções e atributos ---');
  for (const [name, spec] of Object.entries(COLLECTIONS)) {
    const cid = String(spec.id() || '').trim();
    if (!cid) {
      report('fail', `${name}: ID da coleção não configurado`);
      continue;
    }
    try {
      await databases.getCollection(DB_ID, cid);
      report('ok', `Coleção ${name} (${cid}) existe`);
    } catch (e) {
      report('fail', `Coleção ${name} (${cid}): ${e?.message || e}`);
      continue;
    }

    let attrMap;
    try {
      attrMap = await listAttrKeys(databases, cid);
    } catch (e) {
      report('fail', `${name}: não listou atributos — ${e?.message || e}`);
      continue;
    }

    for (const key of spec.required) {
      if (!attrMap.has(key)) {
        report('fail', `${name}: atributo ausente "${key}"`);
      } else if (attrMap.get(key) !== 'ready') {
        report('warn', `${name}: atributo "${key}" status=${attrMap.get(key)}`);
      }
    }
    const readyCount = spec.required.filter((k) => attrMap.get(k) === 'ready').length;
    if (readyCount === spec.required.length) {
      report('ok', `${name}: ${readyCount}/${spec.required.length} atributos obrigatórios prontos`);
    }
  }

  const bucketId = String(process.env.APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID || 'contract_templates').trim();
  console.log('\n--- Appwrite: bucket de modelos (legado PDF) ---');
  try {
    await storage.getBucket(bucketId);
    report('ok', `Bucket ${bucketId} existe (opcional para editor HTML)`);
  } catch {
    report('warn', `Bucket ${bucketId} não encontrado — OK se só usar body_html`);
  }

  console.log('\n--- Autentique: API ---');
  const tokenResolved = resolveEnv('AUTENTIQUE_TOKEN', ['AUTENTIQUE_API_TOKEN']);
  if (!tokenResolved?.value) {
    report('fail', 'Token Autentique ausente — não testou API');
  } else {
    try {
      const r = await verifyAutentiqueToken(tokenResolved.value);
      if (r.ok) report('ok', `API Autentique: ${r.detail}`);
      else report('fail', `API Autentique: ${r.detail}`);
    } catch (e) {
      report('fail', `API Autentique: ${e?.message || e}`);
    }
  }

  const webhookSecret = String(process.env.AUTENTIQUE_WEBHOOK_SECRET || '').trim();
  if (webhookSecret.length < 8) {
    report('warn', 'AUTENTIQUE_WEBHOOK_SECRET curto ou ausente — webhook rejeitará assinaturas');
  } else {
    report('ok', `AUTENTIQUE_WEBHOOK_SECRET definido (${webhookSecret.length} chars)`);
  }

  console.log('\n--- Configuração esperada no painel Autentique (manual) ---');
  console.log('  • Webhook URL: https://<seu-dominio>/api/webhooks/autentique');
  console.log('  • Eventos: document.* e signature.* habilitados');
  console.log('  • Secret = mesmo valor de AUTENTIQUE_WEBHOOK_SECRET na Vercel');

  console.log('\n══ RESUMO ══');
  const fails = issues.filter((i) => i.status === 'fail');
  const warns = issues.filter((i) => i.status === 'warn');
  console.log(`  OK: ${ok.length}  |  Avisos: ${warns.length}  |  Falhas: ${fails.length}`);

  if (fails.length) {
    console.log('\nItens a corrigir:');
    fails.forEach((f) => console.log(`  • ${f.msg}`));
    console.log('\nProvisionar schema: npm run provision:contract-templates');
    console.log('Schema completo contratos: node --env-file=.env scripts/verify-and-fix-schema-integrations.mjs');
    process.exit(2);
  }
  if (warns.length) {
    console.log('\nAvisos (não bloqueiam envio, mas revisar):');
    warns.forEach((w) => console.log(`  • ${w.msg}`));
  }
  console.log('\n✅ Appwrite de contratos parece pronto para uso (revise avisos e webhook no painel).');
}

main().catch((e) => {
  console.error('Falha:', e?.message || e);
  process.exit(1);
});
