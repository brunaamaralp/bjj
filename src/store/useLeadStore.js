import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { databases, DB_ID, LEADS_COL, ACADEMIES_COL } from '../lib/appwrite.js';
import { ID, Query } from 'appwrite';
import { addLeadEvent } from '../lib/leadEvents.js';
import { buildLeadDocumentPermissions } from '../lib/clientDocumentPermissions.js';
import { assertClientBillingMutationsAllowed } from '../lib/billingGateClient.js';
import { LEAD_STATUS, LEAD_ORIGIN } from '../lib/leadStatus.js';
import { mapAppwriteDocToLead } from '../lib/mapAppwriteLeadDoc.js';
import {
  mergeOnboardingStepIdsDone,
  normalizeOnboardingChecklistList,
  parseOnboardingChecklist,
  serializeOnboardingChecklistForDb,
} from '../lib/onboardingChecklist.js';

export { LEAD_STATUS, LEAD_ORIGIN } from '../lib/leadStatus.js';

export const LEADS_PAGE_SIZE = 200;

let fetchLeadsAbortController = null;

/** Índice id → lead para lookup O(1) (ex.: inbox). */
export function buildLeadsById(leads) {
  const byId = Object.create(null);
  for (const l of Array.isArray(leads) ? leads : []) {
    const id = String(l?.id || '').trim();
    if (id) byId[id] = l;
  }
  return byId;
}

export function selectLeadById(state, id) {
  const lid = String(id || '').trim();
  if (!lid) return null;
  return state.leadsById?.[lid] ?? null;
}

function withLeadsIndex(leads) {
  return { leads, leadsById: buildLeadsById(leads) };
}

export function cancelFetchLeads() {
  if (fetchLeadsAbortController) {
    fetchLeadsAbortController.abort();
    fetchLeadsAbortController = null;
  }
}

/** Campos que não são persistidos no Appwrite (aliases / derivados). */
const CLIENT_ONLY_KEYS = new Set([
  'id',
  'createdAt',
  'notes',
  'intention',
  'priority',
  'hotLead',
  '_isNew',
  '_localKanbanIndex',
  'whatsappClassifiedAt'
]);

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

function permissionContextFromStore(get) {
  const academyId = get().academyId;
  const academyList = get().academyList || [];
  const acadDoc = academyList.find((a) => a.id === academyId) || {};
  return {
    ownerId: acadDoc.ownerId || '',
    teamId: acadDoc.teamId || '',
    userId: get().userId || ''
  };
}

/**
 * Atributo Appwrite na coleção de leads para dia de vencimento (1–31).
 * Só grava se a env estiver definida explicitamente (`dueDay` ou `due_day`);
 * valores `off`, `false`, `0`, vazio → não envia (evita erro "Unknown attribute").
 */
const LEAD_DUE_DAY_APPWRITE_KEY = (() => {
  const raw = String(import.meta.env.VITE_APPWRITE_LEAD_DUE_DAY_ATTR || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || ['off', 'false', '0', 'no', 'none'].includes(lower)) return null;
  if (lower === 'due_day') return 'due_day';
  if (lower === 'dueday') return 'dueDay';
  return null;
})();

/** Atributo `turma` na coleção leads. Desative com `VITE_APPWRITE_LEAD_TURMA_ATTR=off`. */
const LEAD_TURMA_APPWRITE_KEY = (() => {
  const raw = String(import.meta.env.VITE_APPWRITE_LEAD_TURMA_ATTR || 'turma').trim();
  const lower = raw.toLowerCase();
  if (['off', 'false', '0', 'no', 'none'].includes(lower)) return null;
  if (lower === 'class_name' || lower === 'classname') return 'class_name';
  return raw || 'turma';
})();

/**
 * Converte updates camelCase (UI) → payload Appwrite (snake novos + camel legados).
 * Não inclui `notes` (deprecado).
 */
function updatesToAppwritePatch(updates, currentLead) {
  const patch = {};
  const u = updates;

  const copyIf = (key, val) => {
    if (val === undefined) return;
    patch[key] = val;
  };

  if (u.name !== undefined) copyIf('name', u.name);
  if (u.phone !== undefined) copyIf('phone', u.phone);
  if (u.type !== undefined) copyIf('type', u.type);
  if (u.origin !== undefined) copyIf('origin', u.origin);
  if (u.status !== undefined) copyIf('status', u.status);
  if (u.scheduledDate !== undefined) copyIf('scheduledDate', u.scheduledDate);
  if (u.scheduledTime !== undefined) copyIf('scheduledTime', u.scheduledTime);
  if (u.parentName !== undefined) copyIf('parentName', u.parentName);
  if (u.age !== undefined) copyIf('age', u.age);
  if (u.lostReason !== undefined) copyIf('lostReason', u.lostReason);
  if (u.sexo !== undefined) {
    const sx = String(u.sexo || '').trim().slice(0, 16);
    patch.sexo = sx;
  }
  if (u.pipelineStage !== undefined) copyIf('pipeline_stage', u.pipelineStage);
  if (u.birthDate !== undefined) copyIf('birth_date', String(u.birthDate || '').slice(0, 10));
  if (u.isFirstExperience !== undefined) copyIf('is_first_experience', u.isFirstExperience);
  if (u.belt !== undefined) copyIf('belt', u.belt);
  if (u.customAnswers !== undefined) {
    patch.custom_answers_json = JSON.stringify(u.customAnswers || {});
  }

  if (u.attendedAt !== undefined) copyIf('attended_at', u.attendedAt);
  if (u.missedAt !== undefined) copyIf('missed_at', u.missedAt);
  if (u.missed_reason !== undefined) copyIf('missed_reason', u.missed_reason);
  if (u.lostAt !== undefined) copyIf('lost_at', u.lostAt);
  if (u.importedAt !== undefined) copyIf('imported_at', u.importedAt);
  if (u.statusChangedAt !== undefined) copyIf('status_changed_at', u.statusChangedAt);
  if (u.pipelineStageChangedAt !== undefined) copyIf('pipeline_stage_changed_at', u.pipelineStageChangedAt);
  if (u.lastNoteAt !== undefined) copyIf('last_note_at', u.lastNoteAt);
  if (u.lastWhatsappActivityAt !== undefined) copyIf('last_whatsapp_activity_at', u.lastWhatsappActivityAt);
  if (u.pendingAutomations !== undefined) copyIf('pending_automations', JSON.stringify(u.pendingAutomations || []));
  if (u.hasPendingAutomations !== undefined) copyIf('has_pending_automations', u.hasPendingAutomations);

  if (u.whatsappIntention !== undefined) copyIf('whatsapp_intention', u.whatsappIntention);
  if (u.whatsappPriority !== undefined) copyIf('whatsapp_priority', u.whatsappPriority);
  if (u.whatsappLeadQuente !== undefined) copyIf('whatsapp_lead_quente', u.whatsappLeadQuente);
  if (u.needHuman !== undefined) copyIf('need_human', Boolean(u.needHuman));
  if (u.triageStatus !== undefined) copyIf('triage_status', String(u.triageStatus || '').trim().slice(0, 32));
  if (u.inboundAuto !== undefined) copyIf('inbound_auto', Boolean(u.inboundAuto));
  if (u.turma !== undefined && LEAD_TURMA_APPWRITE_KEY) {
    copyIf(LEAD_TURMA_APPWRITE_KEY, String(u.turma || '').trim().slice(0, 128));
  }

  const nowIso = new Date().toISOString();
  if (typeof u.status !== 'undefined' && u.status !== currentLead.status) {
    patch.status_changed_at = nowIso;
  }
  if (typeof u.pipelineStage !== 'undefined' && u.pipelineStage !== currentLead.pipelineStage) {
    patch.pipeline_stage_changed_at = nowIso;
  }

  return patch;
}

export const useLeadStore = create(
  persist((set, get) => ({
  leads: [],
  leadsById: {},
  loading: false,
  leadsError: false,
  loadingMore: false,
  leadsHasMore: false,
  leadsCursor: null,
  leadsLastFetchedAt: null,
  academyId: null,
  teamId: null,
  userId: null,
  labels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
  /** Vertical de terminologia: 'fitness' (padrão) | 'physio'. */
  vertical: 'fitness',
  modules: { sales: false, inventory: false, finance: false, aiEnabled: true },
  inboxUnreadConversations: 0,
  onboardingChecklist: null,
  billingAccess: null,
  academyList: [],
  onboardingChecklistReopenNonce: 0,
  /**
   * @deprecated Preferir `leadsReady` / `studentsReady`. Sincronizado quando `fetchLeads` conclui.
   * Não marcar manualmente no bootstrap — o shell usa `academyReady`.
   */
  dataReady: false,
  /** Primeira página de leads carregada para a academia atual. */
  leadsReady: false,
  /** Cache de financeConfig (documento academia); invalidar ao trocar academia. */
  financeConfig: null,
  financeConfigAcademyId: null,

  setAcademyList: (list) => set({ academyList: Array.isArray(list) ? list : [] }),
  setDataReady: (ready) => set({ dataReady: Boolean(ready) }),
  setLeadsReady: (ready) => set({ leadsReady: Boolean(ready) }),

  setFinanceConfig: (config) =>
    set({
      financeConfig: config,
      financeConfigAcademyId: config == null ? null : get().academyId,
    }),

  setAcademyId: (id) => {
    const current = get().academyId;
    if (id && id !== current) {
      cancelFetchLeads();
      // Troca de academia: reset total de dados sensíveis
      set({
        academyId: id,
        leads: [],
        leadsById: {},
        leadsCursor: null,
        leadsHasMore: false,
        leadsLastFetchedAt: null,
        labels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
        vertical: 'fitness',
        onboardingChecklist: null,
        billingAccess: null,
        financeConfig: null,
        financeConfigAcademyId: null,
        dataReady: false,
        leadsReady: false,
      });
    } else if (!id) {
       cancelFetchLeads();
       set({
         academyId: null,
         leads: [],
         leadsById: {},
         leadsCursor: null,
         leadsHasMore: false,
         leadsLastFetchedAt: null,
         vertical: 'fitness',
         onboardingChecklist: null,
         billingAccess: null,
         academyList: [],
         financeConfig: null,
         financeConfigAcademyId: null,
         dataReady: false,
         leadsReady: false,
       });
    }
  },
  setBillingAccess: (v) => set({ billingAccess: v && typeof v === 'object' ? v : null }),
  reopenOnboardingBanner: () =>
    set((s) => ({ onboardingChecklistReopenNonce: (s.onboardingChecklistReopenNonce || 0) + 1 })),

  completeOnboardingStepIds: async (ids) => {
    const academyId = get().academyId;
    if (!academyId || !Array.isArray(ids) || ids.length === 0) return;
    const merged = mergeOnboardingStepIdsDone(get().onboardingChecklist, ids);
    try {
      const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        onboardingChecklist: serializeOnboardingChecklistForDb(merged, {
          preserveRaw: acad.onboardingChecklist,
        }),
      });
    } catch (e) {
      console.warn('completeOnboardingStepIds Appwrite:', e?.message || e);
    }
    set({ onboardingChecklist: merged });
  },
  setOnboardingChecklist: (list) =>
    set({
      onboardingChecklist:
        list == null
          ? parseOnboardingChecklist(null)
          : Array.isArray(list)
            ? normalizeOnboardingChecklistList(list)
            : parseOnboardingChecklist(null)
    }),
  setInboxUnreadConversations: (n) =>
    set({ inboxUnreadConversations: Math.max(0, Math.floor(Number(n) || 0)) }),
  setTeamId: (id) => set({ teamId: id }),
  setUserId: (id) => set({ userId: id }),
  setLabels: (labels) => set({ labels: { ...get().labels, ...(labels || {}) } }),
  setVertical: (v) =>
    set({ vertical: String(v || '').trim() === 'physio' ? 'physio' : 'fitness' }),
  setModules: (mods) => set({ modules: { ...get().modules, ...(mods || {}) } }),

  fetchLeads: async (opts = {}) => {
    const reset = opts.reset !== false;
    const academyId = get().academyId;
    if (!academyId) return;

    const externalSignal = opts.signal;
    if (reset && !externalSignal) {
      cancelFetchLeads();
      fetchLeadsAbortController = new AbortController();
    }
    const signal = externalSignal || (reset ? fetchLeadsAbortController?.signal : null);

    const resetLoadingAfterAbort = () => {
      set({ loading: false, loadingMore: false });
      console.debug('[LeadStore] fetch abortado — loading resetado', { signal: signal?.aborted });
    };

    if (reset) {
      if (get().loading && !externalSignal) return;
      set({ loading: true, leadsError: false });
    } else if (get().loading) {
      return;
    } else if (get().loadingMore || !get().leadsHasMore || !get().leadsCursor) {
      return;
    } else {
      set({ loadingMore: true, leadsError: false });
    }

    try {
      const operationalStatusSet = new Set(Object.values(LEAD_STATUS));
      const queries = [
        Query.equal('academyId', academyId),
        Query.orderDesc('$createdAt'),
        Query.limit(LEADS_PAGE_SIZE)
      ];
      if (opts.search) {
        queries.push(Query.contains('name', opts.search));
      }
      if (!reset && get().leadsCursor) {
        queries.push(Query.cursorAfter(get().leadsCursor));
      }

      const response = await databases.listDocuments(DB_ID, LEADS_COL, queries);
      if (signal?.aborted) {
        resetLoadingAfterAbort();
        return;
      }
      const docs = response.documents || [];
      const leads = docs.map((doc) => mapAppwriteDocToLead(doc, operationalStatusSet));
      const lastId = docs.length ? docs[docs.length - 1].$id : null;
      const pageFull = docs.length === LEADS_PAGE_SIZE;

      if (signal?.aborted) {
        resetLoadingAfterAbort();
        return;
      }

      if (reset) {
        set((state) => {
          const serverIds = new Set(leads.map((l) => l.id));
          const now = new Date();
          const localsToKeep = state.leads.filter((l) => {
            if (!l._isNew) return false;
            const created = new Date(l.createdAt);
            const isRecentlyCreated = now - created < 300000;
            return !serverIds.has(l.id) && isRecentlyCreated;
          });

          const merged = [...localsToKeep, ...leads];
          return {
            ...withLeadsIndex(merged),
            loading: false,
            leadsError: false,
            leadsHasMore: pageFull,
            leadsCursor: pageFull && lastId ? lastId : null,
            leadsLastFetchedAt: Date.now(),
            leadsReady: true,
            dataReady: true,
          };
        });
      } else {
        set((state) => {
          const existingIds = new Set(state.leads.map((l) => l.id));
          const appended = leads.filter((l) => !existingIds.has(l.id));
          const merged = [...state.leads, ...appended];
          return {
            ...withLeadsIndex(merged),
            loadingMore: false,
            leadsError: false,
            leadsHasMore: pageFull,
            leadsCursor: pageFull && lastId ? lastId : null,
            leadsLastFetchedAt: Date.now(),
          };
        });
      }

      if (signal?.aborted) {
        resetLoadingAfterAbort();
        return;
      }

      if (leads.length > 0) {
        const firstLeadDone = Boolean(get().onboardingChecklist?.find((x) => x.id === 'first_lead')?.done);
        if (!firstLeadDone) {
          try {
            await get().completeOnboardingStepIds(['first_lead']);
            if (signal?.aborted) {
              resetLoadingAfterAbort();
              return;
            }
          } catch (e) {
            console.warn('first_lead onboarding sync failed:', e?.message || e);
          }
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError' || signal?.aborted) {
        resetLoadingAfterAbort();
        return;
      }
      console.error('fetchLeads error:', e);
      set({ loading: false, loadingMore: false, leadsError: true, leadsReady: false });
    }
  },

  fetchMoreLeads: async () => {
    await get().fetchLeads({ reset: false });
  },

  addLead: async (lead) => {
    const academyId = get().academyId;
    if (!academyId) return;

    assertClientBillingMutationsAllowed(get().billingAccess);

    try {
      const wasEmpty = get().leads.length === 0;
      const userId = get().userId;
      const permCtx = permissionContextFromStore(get);

      const academyList = get().academyList || [];
      const acadDoc = academyList.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
      const teamId = String(acadDoc.teamId || get().teamId || '').trim();
      const sessionUserId = String(userId || '').trim();
      const perms = buildLeadDocumentPermissions({ teamId, userId: sessionUserId });

      const nowIso = new Date().toISOString();
      const docPayload = {
        name: String(lead.name || '').trim(),
        phone: String(lead.phone || '').trim(),
        type: lead.type || 'Adulto',
        origin: String(lead.origin || ''),
        status: lead.status || LEAD_STATUS.NEW,
        scheduledDate: String(lead.scheduledDate || ''),
        scheduledTime: String(lead.scheduledTime || ''),
        parentName: String(lead.parentName || ''),
        age: lead.age != null && lead.age !== '' ? String(lead.age) : '',
        academyId,
        is_first_experience: lead.isFirstExperience || 'Sim',
        belt: lead.belt || '',
        custom_answers_json: JSON.stringify(lead.customAnswers || {}),
        birth_date: String(lead.birthDate || '').slice(0, 10),
        ...(lead.sexo ? { sexo: String(lead.sexo).trim().slice(0, 16) } : {}),
        pipeline_stage: lead.pipelineStage || 'Novo',
        pipeline_stage_changed_at: nowIso,
        status_changed_at: nowIso,
      };
      if (LEAD_TURMA_APPWRITE_KEY && lead.turma) {
        docPayload[LEAD_TURMA_APPWRITE_KEY] = String(lead.turma).trim().slice(0, 128);
      }
      const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), docPayload, perms);

      try {
        await addLeadEvent({
          academyId,
          leadId: doc.$id,
          type: 'lead_criado',
          text: 'Lead criado',
          at: doc.$createdAt,
          createdBy: userId || 'user',
          permissionContext: permCtx
        });
      } catch (evtErr) {
        console.warn('Failed to insert lead_criado event:', evtErr);
      }

      for (const ev of lead.notes || []) {
        if (ev && ev.type === 'note' && String(ev.text || '').trim()) {
          try {
            await addLeadEvent({
              academyId,
              leadId: doc.$id,
              type: 'note',
              text: String(ev.text).slice(0, 1000),
              at: ev.at || nowIso,
              createdBy: 'user',
              permissionContext: permCtx
            });
          } catch (evtErr) {
            console.warn('Failed to insert lead note event:', evtErr);
          }
        }
      }

      const newLead = {
        id: doc.$id,
        ...lead,
        pipelineStage: lead.pipelineStage || 'Novo',
        notes: [],
        createdAt: doc.$createdAt,
        pipelineStageChangedAt: nowIso,
        statusChangedAt: nowIso,
        _isNew: true
      };

      set((state) => withLeadsIndex([newLead, ...state.leads]));

      if (wasEmpty) {
        try {
          const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
          const merged = mergeOnboardingStepIdsDone(
            parseOnboardingChecklist(acad.onboardingChecklist),
            ['first_lead']
          );
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            onboardingChecklist: serializeOnboardingChecklistForDb(merged, {
              preserveRaw: acad.onboardingChecklist,
            }),
          });
          get().setOnboardingChecklist(merged);
        } catch (e) {
          console.warn('onboardingChecklist update failed:', e?.message || e);
        }
      }
      return newLead;
    } catch (e) {
      console.error('addLead error:', e);
      throw e;
    }
  },

  updateLead: async (id, updates, opts = {}) => {
    assertClientBillingMutationsAllowed(get().billingAccess);

    try {
      const lid = String(id || '').trim();
      const fallbackLead = opts?.fallbackLead;
      let currentLead =
        get().leadsById?.[lid] || get().leads.find((l) => l.id === lid) || null;

      if (!currentLead && fallbackLead && String(fallbackLead.id || '').trim() === lid) {
        currentLead = fallbackLead;
      }

      if (!currentLead) {
        try {
          const operationalStatusSet = new Set(Object.values(LEAD_STATUS));
          const doc = await databases.getDocument(DB_ID, LEADS_COL, lid);
          currentLead = mapAppwriteDocToLead(doc, operationalStatusSet);
        } catch {
          throw new Error('Registro não encontrado. Recarregue a página.');
        }
      }

      const normalizedUpdates = { ...updates };

      const filtered = {};
      for (const [k, v] of Object.entries(normalizedUpdates)) {
        if (!CLIENT_ONLY_KEYS.has(k)) filtered[k] = v;
      }

      const patch = updatesToAppwritePatch(filtered, currentLead);

      delete patch.id;
      delete patch.createdAt;
      delete patch.notes;

      if (import.meta.env.DEV) {
        console.debug('[updateLead] patch', { id, patch });
      }

      await databases.updateDocument(DB_ID, LEADS_COL, lid, patch);

      const mergedLead = { ...currentLead, ...normalizedUpdates };
      if (typeof filtered.status !== 'undefined' && filtered.status !== currentLead.status) {
        mergedLead.statusChangedAt = patch.status_changed_at || mergedLead.statusChangedAt;
      }
      if (typeof filtered.pipelineStage !== 'undefined' && filtered.pipelineStage !== currentLead.pipelineStage) {
        mergedLead.pipelineStageChangedAt = patch.pipeline_stage_changed_at || mergedLead.pipelineStageChangedAt;
      }

      set((state) => {
        const has = state.leads.some((l) => l.id === lid);
        const nextLeads = has
          ? state.leads.map((l) => (l.id === lid ? mergedLead : l))
          : [mergedLead, ...state.leads];
        return withLeadsIndex(nextLeads);
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[updateLead] rejected', e?.message || e);
      } else {
        console.error('updateLead error:', e);
      }
      throw e;
    }
  },

  deleteLead: async (id) => {
    assertClientBillingMutationsAllowed(get().billingAccess);

    const previousLeads = get().leads;
    const previousById = get().leadsById;
    set((state) => withLeadsIndex(state.leads.filter((l) => l.id !== id)));
    try {
      await databases.deleteDocument(DB_ID, LEADS_COL, id);
    } catch (e) {
      set({ leads: previousLeads, leadsById: previousById });
      console.error('deleteLead error:', e);
      throw e;
    }
  },

  importLeads: async (leadsArray) => {
    const academyId = get().academyId;
    if (!academyId) return;

    assertClientBillingMutationsAllowed(get().billingAccess);

    const wasEmpty = get().leads.length === 0;
    const newLeads = [];
    const userId = get().userId;
    const academyList = get().academyList || [];
    const acadDoc = academyList.find((a) => a.id === academyId) || {};
    const teamId = String(acadDoc.teamId || get().teamId || '').trim();
    const permCtx = permissionContextFromStore(get);
    const perms = buildLeadDocumentPermissions({ teamId, userId });

    for (const lead of leadsArray) {
      try {
        const nowIso = new Date().toISOString();
        const phone = lead.phone || '';
        const name = lead.name || '';

        const existsLocally = get().leads.find(
          (l) =>
            normalizePhone(l.phone) === normalizePhone(phone) &&
            String(l.name).toLowerCase() === String(name).toLowerCase()
        );
        if (existsLocally) {
          console.log('Skipping duplicate lead in import:', name);
          continue;
        }

        const importPayload = {
            name: lead.name,
            phone: lead.phone || '',
            type: lead.type || 'Adulto',
            origin: lead.origin || 'Planilha',
            status: lead.status || LEAD_STATUS.NEW,
            scheduledDate: lead.scheduledDate || '',
            scheduledTime: lead.scheduledTime || '',
            parentName: lead.parentName || '',
            age: lead.age || '',
            academyId,
            pipeline_stage: lead.pipelineStage || 'Novo',
            imported_at: nowIso,
            status_changed_at: nowIso,
            pipeline_stage_changed_at: nowIso,
            birth_date: String(lead.birthDate || '').slice(0, 10),
            is_first_experience: lead.isFirstExperience || 'Sim',
            belt: lead.belt || '',
            custom_answers_json: JSON.stringify(lead.customAnswers || {}),
          };
        const doc = await databases.createDocument(
          DB_ID,
          LEADS_COL,
          ID.unique(),
          importPayload,
          perms
        );

        try {
          await addLeadEvent({
            academyId,
            leadId: doc.$id,
            type: 'import',
            text: 'Importado (Planilha)',
            at: nowIso,
            createdBy: 'system',
            payloadJson: { source: 'Planilha' },
            permissionContext: permCtx
          });
        } catch (evtErr) {
          console.warn('Failed to insert import event:', evtErr);
        }

        newLeads.push({
          id: doc.$id,
          ...lead,
          pipelineStage: lead.pipelineStage || 'Novo',
          notes: [],
          createdAt: doc.$createdAt,
          pipelineStageChangedAt: nowIso,
          importedAt: nowIso
        });
      } catch (e) {
        console.error('import error for', lead.name, e);
      }
    }
    set((state) => withLeadsIndex([...newLeads, ...state.leads]));

    if (wasEmpty && newLeads.length > 0) {
      try {
        const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const merged = mergeOnboardingStepIdsDone(
          parseOnboardingChecklist(acad.onboardingChecklist),
          ['first_lead']
        );
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          onboardingChecklist: serializeOnboardingChecklistForDb(merged, {
            preserveRaw: acad.onboardingChecklist,
          }),
        });
        get().setOnboardingChecklist(merged);
      } catch (e) {
        console.warn('onboardingChecklist update failed (import):', e?.message || e);
      }
    }
  },

  getLeadById: (id) => selectLeadById(get(), id),

  fetchLeadById: async (id) => {
    const lid = String(id || '').trim();
    const found = selectLeadById(get(), lid);
    if (found) return found;
    const academyId = String(get().academyId || '').trim();
    if (!LEADS_COL || !lid || !academyId) return null;
    try {
      const operationalStatusSet = new Set(Object.values(LEAD_STATUS));
      const doc = await databases.getDocument(DB_ID, LEADS_COL, lid);
      const docAcademy = String(doc?.academyId || doc?.academy_id || '').trim();
      if (!docAcademy || docAcademy !== academyId) return null;
      const lead = mapAppwriteDocToLead(doc, operationalStatusSet);
      set((state) => {
        const exists = Boolean(state.leadsById?.[lid]);
        const merged = exists
          ? state.leads.map((l) => (l.id === lid ? lead : l))
          : [lead, ...state.leads];
        return withLeadsIndex(merged);
      });
      return lead;
    } catch (e) {
      console.warn('[fetchLeadById]', lid, e?.message || e);
      return null;
    }
  },

  /** Reordena leads de um estágio só no cliente (sem API). */
  patchLeadsOrder: (_stage, reorderedLeads) => {
    const reorderedIds = new Set((reorderedLeads || []).map((l) => l.id));
    const withIndex = (reorderedLeads || []).map((lead, index) => ({
      ...lead,
      _localKanbanIndex: index,
    }));
    const indexById = new Map(withIndex.map((l) => [l.id, l]));
    set((state) =>
      withLeadsIndex(
        state.leads.map((l) => (reorderedIds.has(l.id) ? indexById.get(l.id) || l : l))
      )
    );
  },
}),
{
  name: 'nave-lead-store',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    academyId: state.academyId,
    academyList: state.academyList,
    userId: state.userId,
    teamId: state.teamId,
    modules: state.modules,
    labels: state.labels
  })
}
)
);

if (typeof window !== 'undefined') {
  window.useLeadStore = useLeadStore;
}

/** Selector reativo da vertical de terminologia. */
export function useVertical() {
  return useLeadStore((s) => s.vertical);
}
