import { Client, Account, Databases, Functions, Teams, Realtime } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const endpointFallback = "";
export const APPWRITE_PROJECT =
  import.meta.env.VITE_APPWRITE_PROJECT_ID ||
  import.meta.env.VITE_APPWRITE_PROJECT ||
  "699f020c00171ce26206";
const project = APPWRITE_PROJECT;
const buildMarker = "FORCE_SFO_ENDPOINT_1";
const selectedEndpoint = endpointFallback || endpoint;
const client = new Client()
    .setEndpoint(selectedEndpoint)
    .setProject(project);

const account = new Account(client);
const databases = new Databases(client);
const functions = new Functions(client);
const teams = new Teams(client);
const realtime = new Realtime(client);

// IDs para as collections e banco (necessários para o funcionamento do CRM)
export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "699f06a6001a11c21825";
export const LEADS_COL = import.meta.env.VITE_APPWRITE_LEADS_COLLECTION_ID || "699f10500032d0fd5b80";
/** Alunos matriculados (coleção separada do funil). */
export const STUDENTS_COL = import.meta.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || "";
/** Collection lead_events (timeline). Opcional até configurar no Appwrite. */
export const LEAD_EVENTS_COL = import.meta.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID || "";
export const ACADEMIES_COL = import.meta.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || "699f1068000e1b1ca1d2";
export const CONVERSATIONS_COL = import.meta.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || "";
export const LABELS_COL = import.meta.env.VITE_APPWRITE_LABELS_COLLECTION_ID || "";
export const NOTE_NOTIFICATIONS_COL = import.meta.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || "";
export const STOCK_ITEMS_COL = import.meta.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || "";
export const PRODUCTS_COL = import.meta.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID || "";
export const PRODUCT_VARIANTS_COL =
  import.meta.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID || "";
export const INVENTORY_MOVE_FN_ID = import.meta.env.VITE_APPWRITE_INVENTORY_MOVE_FN_ID || "";
export const SALES_CREATE_FN_ID = import.meta.env.VITE_APPWRITE_SALES_CREATE_FN_ID || "";
export const SALES_CANCEL_FN_ID = import.meta.env.VITE_APPWRITE_SALES_CANCEL_FN_ID || "";
export const INVENTORY_SEED_KIMONOS_FN_ID = import.meta.env.VITE_APPWRITE_INVENTORY_SEED_KIMONOS_FN_ID || "";

export const FINANCIAL_TX_COL =
  import.meta.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || '';

export const ACCOUNTS_COL =
  import.meta.env.VITE_APPWRITE_ACCOUNTS_COLLECTION_ID || '';

export const JOURNAL_COL =
  import.meta.env.VITE_APPWRITE_JOURNAL_COLLECTION_ID || '';

export const FINANCE_TX_FN_ID =
  import.meta.env.VITE_APPWRITE_FINANCE_TX_FN_ID || '';

export const ATTENDANCE_COL =
  import.meta.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID || '';

// Tamanhos padrão de kimono
export const KIMONO_SIZES = {
    adulto_unissex: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
    feminino: ['F0', 'F1', 'F2', 'F3', 'F4'],
    infantil: ['M00', 'M0', 'M1', 'M2', 'M3', 'M4']
};

if (import.meta.env.DEV) {
  console.log('Appwrite config:', {
    buildMarker,
    endpoint,
    project,
    database: DB_ID,
    leadsCol: LEADS_COL,
    studentsCol: STUDENTS_COL || '(unset)',
    academiesCol: ACADEMIES_COL,
    inventoryMoveFn: INVENTORY_MOVE_FN_ID || '(unset)',
    salesCreateFn: SALES_CREATE_FN_ID || '(unset)',
    salesCancelFn: SALES_CANCEL_FN_ID || '(unset)',
  });
}

export const ENDPOINT = endpoint;
export { APPWRITE_PROJECT as PROJECT_ID };
export const ENDPOINT_FALLBACK = endpointFallback;
export function setClientEndpoint(ep) { client.setEndpoint(ep); }

/** Appwrite JWTs expire in ~15 min; refresh slightly before. */
const SESSION_JWT_CACHE_MS = 14 * 60 * 1000;

let cachedSessionJwt = '';
let cachedSessionJwtExpiresAt = 0;
/** @type {Promise<string> | null} */
let sessionJwtInFlight = null;
let sessionJwtCooldownUntil = 0;

/** Limpa JWT em memória (logout / troca de sessão). */
export function clearSessionJwtCache() {
  cachedSessionJwt = '';
  cachedSessionJwtExpiresAt = 0;
  sessionJwtInFlight = null;
  sessionJwtCooldownUntil = 0;
  clearClientJwt();
}

/**
 * Appwrite prioriza JWT sobre cookie de sessão no client compartilhado.
 * Operações de conta (get, createJWT) precisam do cookie — limpar JWT antes.
 */
export function clearClientJwt() {
  try {
    client.setJWT('');
  } catch {
    void 0;
  }
}

function isJwtRateLimitedError(err) {
  const status = Number(err?.code ?? err?.status ?? err?.response?.status);
  if (status === 429) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
}

function isJwtForbiddenError(err) {
  const status = Number(err?.code ?? err?.status ?? err?.response?.status);
  return status === 403;
}

async function mintSessionJwtFromCookie() {
  clearClientJwt();
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

/**
 * Sincroniza JWT da sessão no client Appwrite (Realtime + Databases no browser).
 * Necessário quando cookies de sessão não bastam ou expiraram.
 */
export async function syncClientSessionJwt() {
  const token = await createSessionJwt();
  if (token) client.setJWT(token);
  return token;
}

/** JWT de curta duração para rotas /api (ex.: billing, academies/create). */
export async function createSessionJwt() {
  const now = Date.now();
  if (cachedSessionJwt && now < cachedSessionJwtExpiresAt) {
    return cachedSessionJwt;
  }
  if (now < sessionJwtCooldownUntil) {
    return cachedSessionJwt;
  }
  if (sessionJwtInFlight) {
    return sessionJwtInFlight;
  }

  sessionJwtInFlight = (async () => {
    try {
      let token = '';
      try {
        token = await mintSessionJwtFromCookie();
      } catch (err) {
        if (isJwtForbiddenError(err)) {
          cachedSessionJwt = '';
          cachedSessionJwtExpiresAt = 0;
          token = await mintSessionJwtFromCookie();
        } else {
          throw err;
        }
      }
      if (token) {
        cachedSessionJwt = token;
        cachedSessionJwtExpiresAt = Date.now() + SESSION_JWT_CACHE_MS;
      }
      return token;
    } catch (err) {
      if (isJwtRateLimitedError(err)) {
        sessionJwtCooldownUntil = Date.now() + 30_000;
      }
      return cachedSessionJwt || '';
    } finally {
      sessionJwtInFlight = null;
    }
  })();

  return sessionJwtInFlight;
}

export { client, account, databases, functions, teams, realtime };
export default client;
