import { Client, Databases, Query } from 'node-appwrite';
import { timingSafeEqual } from 'crypto';
import { sendZapsterText } from '../../lib/server/zapsterSend.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const AUTOMATION_DEFAULTS = {
  schedule_confirm: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  presence_confirmed: { active: false, templateKey: 'post_class', delayMinutes: 0 },
  missed: { active: false, templateKey: 'missed', delayMinutes: 0 },
  waiting_decision: { active: false, templateKey: 'recovery', delayMinutes: 1440 },
  converted: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  schedule_reminder: { active: false, templateKey: 'reminder', delayMinutes: 120 },
};

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function parseAutomationsConfig(raw) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [
        key,
        { ...defaults, ...(saved[key] ?? {}) },
      ])
    );
  } catch {
    return AUTOMATION_DEFAULTS;
  }
}

function parsePendingAutomations(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        key: String(x.key || '').trim(),
        sendAt: String(x.sendAt || '').trim(),
        sent: x.sent === true,
      }))
      .filter((x) => x.key && x.sendAt);
  } catch {
    return [];
  }
}

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!expected || !safeCompare(token, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL || !ACADEMIES_COL) {
    return res.status(503).json({ error: 'misconfigured' });
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const academyCache = new Map();
  let scanned = 0;
  let due = 0;
  let sent = 0;
  let errors = 0;
  const now = Date.now();
  const MAX_MS = 9000;
  const t0 = Date.now();

  const page = await databases.listDocuments(DB_ID, LEADS_COL, [
    Query.equal('has_pending_automations', [true]),
    Query.limit(100),
  ]);
  const docs = page.documents || [];
  for (const doc of docs) {
    if (Date.now() - t0 >= MAX_MS) break;
    scanned += 1;
    const pending = parsePendingAutomations(doc.pending_automations);
    if (!pending.some((p) => p.sent !== true)) continue;

    const academyId = String(doc.academyId || '').trim();
    if (!academyId) continue;
    if (!academyCache.has(academyId)) {
      try {
        const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        academyCache.set(academyId, academy);
      } catch {
        academyCache.set(academyId, null);
      }
    }
    const academy = academyCache.get(academyId);
    if (!academy) continue;

    let changed = false;
    const cfgMap = parseAutomationsConfig(academy.automations_config);
    let templatesOverride = {};
    try {
      const raw = academy.whatsappTemplates;
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (p && typeof p === 'object' && !Array.isArray(p)) templatesOverride = p;
    } catch {
      templatesOverride = {};
    }
    const templates = { ...DEFAULT_WHATSAPP_TEMPLATES, ...templatesOverride };

    const nextPending = [...pending];
    for (let i = 0; i < nextPending.length; i += 1) {
      const item = nextPending[i];
      if (item.sent === true) continue;
      const sendAtMs = new Date(item.sendAt).getTime();
      if (!Number.isFinite(sendAtMs) || sendAtMs > now) continue;
      due += 1;

      const cfg = cfgMap?.[item.key];
      if (!cfg?.active) {
        nextPending[i] = { ...item, sent: true };
        changed = true;
        continue;
      }

      const templateRaw = String(templates[cfg.templateKey] || '').trim();
      const phone = normalizePhone(doc.phone);
      const instanceId = String(academy?.zapster_instance_id || academy?.zapsterInstanceId || '').trim();
      if (!templateRaw || !phone || !instanceId) {
        errors += 1;
        continue;
      }
      const message = applyWhatsappTemplatePlaceholders(templateRaw, {
        lead: {
          name: doc.name,
          scheduledDate: doc.scheduledDate,
          scheduledTime: doc.scheduledTime,
        },
        academyName: String(academy?.name || '').trim(),
      });
      const out = await sendZapsterText({ recipient: phone, text: message, instanceId });
      if (!out?.ok) {
        errors += 1;
        continue;
      }
      sent += 1;
      nextPending[i] = { ...item, sent: true };
      changed = true;
    }
    if (changed) {
      try {
        const stillHasPending = nextPending.some((p) => p.sent !== true);
        await databases.updateDocument(DB_ID, LEADS_COL, doc.$id, {
          pending_automations: JSON.stringify(nextPending),
          has_pending_automations: stillHasPending,
        });
      } catch {
        errors += 1;
      }
    }
  }

  return res.status(200).json({
    mode: 'automations',
    scanned,
    due,
    sent,
    errors,
  });
}
