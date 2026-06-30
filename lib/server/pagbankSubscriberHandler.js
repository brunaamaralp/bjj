import { ID, Query } from 'node-appwrite';
import { getPagbankCredentials } from './getPagbankCredentials.js';
import { databases, DB_ID } from './academyAccess.js';
import { resolvePagbankRequestAuth } from './pagbankRequestAuth.js';

const SUBSCRIBERS_COL =
  process.env.PAGBANK_SUBSCRIBERS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_SUBSCRIBERS_COLLECTION_ID ||
  'pagbank_subscribers';

const PAGBANK_API_URL = String(
  process.env.PAGBANK_SUBSCRIPTIONS_API_URL ||
    process.env.PAGBANK_API_URL ||
    'https://sandbox.api.assinaturas.pagseguro.com'
).replace(/\/$/, '');

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_json' };
  }
  return { body };
}

export function parsePhoneFromRaw(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length >= 12 && digits.startsWith('55')) {
    return {
      country: '55',
      area: digits.slice(2, 4),
      number: digits.slice(4),
    };
  }
  if (digits.length === 10 || digits.length === 11) {
    return {
      country: '55',
      area: digits.slice(0, 2),
      number: digits.slice(2),
    };
  }
  return null;
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'object') return null;
  const country = String(phone.country || '').replace(/\D/g, '');
  const area = String(phone.area || '').replace(/\D/g, '');
  const number = String(phone.number || '').replace(/\D/g, '');
  if (!country || !area || !number) return null;
  return { country, area, number };
}

function formatPhoneStorage(phone) {
  if (!phone) return '';
  return `${phone.country}${phone.area}${phone.number}`.slice(0, 20);
}

export function validateSubscriberBody(body) {
  const missing = [];
  const encrypted_card = String(body?.encrypted_card ?? '').trim();
  const student_id = String(body?.student_id ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const tax_id = String(body?.tax_id ?? '').replace(/\D/g, '');
  const birth_date = String(body?.birth_date ?? '').trim();
  const phone = normalizePhone(body?.phone);

  if (!encrypted_card) missing.push('encrypted_card');
  if (!student_id) missing.push('student_id');
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!tax_id) missing.push('tax_id');
  if (!birth_date) missing.push('birth_date');

  if (missing.length) {
    return { error: 'missing_fields', fields: missing };
  }

  if (!/^\d{11}$/.test(tax_id)) {
    return { error: 'invalid_tax_id' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
    return { error: 'missing_fields', fields: ['birth_date'] };
  }

  return {
    encrypted_card,
    student_id,
    name,
    email,
    tax_id,
    birth_date,
    phone,
  };
}

export function buildPagbankCustomerPayload({ academyId, studentId, data }) {
  const payload = {
    reference_id: `nave:${academyId}:${studentId}`.slice(0, 65),
    name: data.name.slice(0, 150),
    email: data.email.slice(0, 60),
    tax_id: data.tax_id,
    birth_date: data.birth_date,
    billing_info: [
      {
        type: 'CREDIT_CARD',
        card: {
          encrypted: data.encrypted_card,
        },
      },
    ],
  };

  if (data.phone) {
    payload.phones = [
      {
        country: data.phone.country,
        area: data.phone.area,
        number: data.phone.number,
      },
    ];
  }

  return payload;
}

export async function pagbankSubscriptionsFetch(token, path, init = {}) {
  const url = path.startsWith('http') ? path : `${PAGBANK_API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      data?.error_messages?.[0]?.description ||
        data?.message ||
        data?.errors?.[0]?.description ||
        `PagBank HTTP ${res.status}`
    );
    err.status = res.status;
    err.pagbank = data;
    throw err;
  }
  return data;
}

async function findExistingSubscriber(studentId, academyId) {
  if (!SUBSCRIBERS_COL) return null;
  const res = await databases.listDocuments(DB_ID, SUBSCRIBERS_COL, [
    Query.equal('student_id', studentId),
    Query.equal('academy_id', academyId),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

function extractCardMeta(pagbankCustomer) {
  const card = pagbankCustomer?.billing_info?.[0]?.card || {};
  return {
    card_last4: String(card.last_digits || card.last4 || '').slice(-4),
    card_brand: String(card.brand || '').slice(0, 32),
  };
}

async function resolvePagbankCredentials(academyId, res) {
  try {
    return await getPagbankCredentials(academyId);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === 'pagbank_not_enabled') {
      res.status(403).json({ error: 'pagbank_not_enabled' });
      return null;
    }
    if (msg === 'pagbank_token_missing') {
      res.status(503).json({ error: 'pagbank_not_configured' });
      return null;
    }
    console.error('[pagbankSubscriberHandler] credentials_error academy:', academyId, msg);
    res.status(500).json({ error: 'credentials_error' });
    return null;
  }
}

export default async function pagbankSubscriberHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!SUBSCRIBERS_COL || !DB_ID) {
    return res.status(503).json({ error: 'server_misconfigured' });
  }

  const auth = await resolvePagbankRequestAuth(req, res);
  if (!auth) return;
  const { academyId, studentContext } = auth;

  const parsed = parseJsonBody(req);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const mergedBody = { ...(parsed.body || {}) };
  if (studentContext) {
    mergedBody.student_id = mergedBody.student_id || studentContext.student_id || '';
    mergedBody.name = mergedBody.name || studentContext.student_name || '';
    mergedBody.email = mergedBody.email || studentContext.student_email || '';
    mergedBody.tax_id = mergedBody.tax_id || studentContext.student_tax_id || '';
    mergedBody.birth_date = mergedBody.birth_date || studentContext.student_birth_date || '';
    if (!mergedBody.phone && studentContext.student_phone) {
      mergedBody.phone = parsePhoneFromRaw(studentContext.student_phone);
    }
  }

  const validated = validateSubscriberBody(mergedBody);
  if (validated.error === 'missing_fields') {
    return res.status(400).json({ error: validated.error, fields: validated.fields });
  }
  if (validated.error === 'invalid_tax_id') {
    return res.status(400).json({ error: 'invalid_tax_id' });
  }

  const existing = await findExistingSubscriber(validated.student_id, academyId);
  if (existing) {
    return res.status(200).json({
      ok: true,
      subscriber_id: existing.subscriber_id,
      existing: true,
      card_last4: existing.card_last4 || '',
      card_brand: existing.card_brand || '',
    });
  }

  const creds = await resolvePagbankCredentials(academyId, res);
  if (!creds) return;

  const customerPayload = buildPagbankCustomerPayload({
    academyId,
    studentId: validated.student_id,
    data: validated,
  });

  if (!customerPayload.phones?.length) {
    return res.status(400).json({ error: 'missing_fields', fields: ['phone'] });
  }

  let pagbankCustomer;
  try {
    pagbankCustomer = await pagbankSubscriptionsFetch(creds.token, '/customers', {
      method: 'POST',
      headers: {
        'x-idempotency-key': `subscriber:${academyId}:${validated.student_id}`.slice(0, 200),
      },
      body: JSON.stringify(customerPayload),
    });
  } catch (e) {
    const status = Number(e?.status || 0);
    console.error('[pagbankSubscriberHandler] pagbank_create_failed', {
      academyId,
      studentId: validated.student_id,
      status,
      message: e?.message || e,
    });
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'pagbank_auth_error' });
    }
    if (status >= 400 && status < 500) {
      return res.status(422).json({ error: 'pagbank_rejected', detail: String(e?.message || 'rejected') });
    }
    return res.status(502).json({ error: 'pagbank_unavailable' });
  }

  const subscriberId = String(pagbankCustomer?.id || '').trim();
  if (!subscriberId) {
    console.error('[pagbankSubscriberHandler] pagbank_missing_subscriber_id academy:', academyId);
    return res.status(502).json({ error: 'pagbank_unavailable' });
  }

  const { card_last4, card_brand } = extractCardMeta(pagbankCustomer);

  try {
    await databases.createDocument(DB_ID, SUBSCRIBERS_COL, ID.unique(), {
      subscriber_id: subscriberId,
      student_id: validated.student_id,
      academy_id: academyId,
      name: validated.name.slice(0, 256),
      email: validated.email.slice(0, 320),
      tax_id: validated.tax_id,
      phone: formatPhoneStorage(validated.phone),
      card_last4,
      card_brand,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e?.code === 409 || String(e?.message || '').toLowerCase().includes('already')) {
      const dup = await findExistingSubscriber(validated.student_id, academyId);
      if (dup) {
        return res.status(200).json({
          ok: true,
          subscriber_id: dup.subscriber_id,
          existing: true,
          card_last4: dup.card_last4 || card_last4,
          card_brand: dup.card_brand || card_brand,
        });
      }
    }
    console.error('[pagbankSubscriberHandler] appwrite_create_failed academy:', academyId, e?.message || e);
    return res.status(500).json({ error: 'persist_failed' });
  }

  return res.status(200).json({
    ok: true,
    subscriber_id: subscriberId,
    card_last4,
    card_brand,
  });
}
