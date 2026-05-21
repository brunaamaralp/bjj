import { databases, DB_ID, ACADEMIES_COL } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { parseOnboardingChecklist } from './onboardingChecklist.js';

const TTL_MS = 60_000;

/** @type {Map<string, { doc?: object, fetchedAt?: number, promise?: Promise<object> }>} */
const cache = new Map();

export function invalidateAcademyDocumentCache(academyId) {
  if (academyId) {
    cache.delete(String(academyId).trim());
    return;
  }
  cache.clear();
}

/**
 * Documento da academia com deduplicação em memória (TTL 60s).
 * Chamadas concorrentes compartilham a mesma Promise.
 */
export async function getAcademyDocument(academyId, opts = {}) {
  const id = String(academyId || '').trim();
  if (!id) throw new Error('academy_id_required');

  const force = opts.force === true;
  const now = Date.now();
  const entry = cache.get(id);

  if (!force && entry?.doc && entry.fetchedAt != null && now - entry.fetchedAt < TTL_MS) {
    return entry.doc;
  }
  if (!force && entry?.promise) {
    return entry.promise;
  }

  const promise = databases
    .getDocument(DB_ID, ACADEMIES_COL, id)
    .then((doc) => {
      cache.set(id, { doc, fetchedAt: Date.now() });
      return doc;
    })
    .catch((err) => {
      const cur = cache.get(id);
      if (cur?.promise === promise) cache.delete(id);
      throw err;
    });

  cache.set(id, { ...(entry || {}), promise });
  return promise;
}

export function parseAcademyModulesAndLabels(doc) {
  let uiLabels = null;
  let mods = null;
  try {
    if (doc?.uiLabels) {
      uiLabels = typeof doc.uiLabels === 'string' ? JSON.parse(doc.uiLabels) : doc.uiLabels;
    }
    if (doc?.modules) {
      mods = typeof doc.modules === 'string' ? JSON.parse(doc.modules) : doc.modules;
    }
  } catch {
    uiLabels = null;
    mods = null;
  }
  const labelVertical = String(doc?.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
  return { uiLabels, mods, labelVertical };
}

/** Aplica labels, vertical, módulos e checklist no useLeadStore. */
export function applyAcademyDocToLeadStore(doc, setters = {}) {
  const { setLabels, setModules } = setters;
  const { uiLabels, mods, labelVertical } = parseAcademyModulesAndLabels(doc);

  if (uiLabels && typeof uiLabels === 'object' && setLabels) {
    setLabels({
      leads: uiLabels.leads || (labelVertical === 'physio' ? 'Pacientes' : 'Leads'),
      students: uiLabels.students || (labelVertical === 'physio' ? 'Pacientes' : 'Alunos'),
      classes: uiLabels.classes || (labelVertical === 'physio' ? 'Atendimentos' : 'Aulas'),
      pipeline: uiLabels.pipeline || 'Funil',
    });
  }

  try {
    useLeadStore.getState().setVertical(doc?.vertical || 'fitness');
  } catch {
    void 0;
  }

  if (mods && typeof mods === 'object' && setModules) {
    setModules({
      sales: Boolean(mods.sales),
      inventory: Boolean(mods.inventory),
      finance: Boolean(mods.finance),
    });
  } else if (setModules) {
    setModules({ sales: false, inventory: false, finance: false });
  }

  try {
    useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(doc?.onboardingChecklist));
  } catch {
    void 0;
  }

  try {
    useLeadStore.getState().setTeamId(String(doc?.teamId || '').trim() || null);
  } catch {
    void 0;
  }
}
