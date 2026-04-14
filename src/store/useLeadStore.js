import { create } from 'zustand';
import { databases, DB_ID, LEADS_COL, ACADEMIES_COL } from '../lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { addLeadEvent } from '../lib/leadEvents.js';
import { LEAD_STATUS, LEAD_ORIGIN } from '../lib/leadStatus.js';
import { mapAppwriteDocToLead } from '../lib/mapAppwriteLeadDoc.js';
import {
  mergeOnboardingStepIdsDone,
  normalizeOnboardingChecklistList,
  parseOnboardingChecklist,
} from '../lib/onboardingChecklist.js';

export { LEAD_STATUS, LEAD_ORIGIN } from '../lib/leadStatus.js';

export const LEADS_PAGE_SIZE = 200;

/** Campos que não são persistidos no Appwrite (aliases / derivados). */
const CLIENT_ONLY_KEYS = new Set([
  'id',
  'createdAt',
  'notes',
  'intention',
  'priority',
  'hotLead',
  'labelIds',
  '_isNew',
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
  if (u.contact_type !== undefined) copyIf('contact_type', u.contact_type);
  if (u.status !== undefined) copyIf('status', u.status);
  if (u.scheduledDate !== undefined) copyIf('scheduledDate', u.scheduledDate);
  if (u.scheduledTime !== undefined) copyIf('scheduledTime', u.scheduledTime);
  if (u.parentName !== undefined) copyIf('parentName', u.parentName);
  if (u.age !== undefined) copyIf('age', u.age);
  if (u.lostReason !== undefined) copyIf('lostReason', u.lostReason);
  if (u.plan !== undefined) copyIf('plan', u.plan);
  if (u.enrollmentDate !== undefined) copyIf('enrollmentDate', u.enrollmentDate);
  if (u.emergencyContact !== undefined) copyIf('emergencyContact', u.emergencyContact);
  if (u.emergencyPhone !== undefined) copyIf('emergencyPhone', u.emergencyPhone);
  if (u.label_ids !== undefined) copyIf('label_ids', u.label_ids);

  if (u.pipelineStage !== undefined) copyIf('pipeline_stage', u.pipelineStage);
  if (u.birthDate !== undefined) copyIf('birth_date', String(u.birthDate || '').slice(0, 10));
  if (u.isFirstExperience !== undefined) copyIf('is_first_experience', u.isFirstExperience);
  if (u.belt !== undefined) copyIf('belt', u.belt);
  if (u.borrowedKimono !== undefined) {
    copyIf('borrowed_kimono', String(u.borrowedKimono || '').trim().slice(0, 32));
  }
  if (u.borrowedShirt !== undefined) {
    copyIf('borrowed_shirt', String(u.borrowedShirt || '').trim().slice(0, 32));
  }
  if (u.customAnswers !== undefined) {
    patch.custom_answers_json = JSON.stringify(u.customAnswers || {});
  }

  if (u.attendedAt !== undefined) copyIf('attended_at', u.attendedAt);
  if (u.missedAt !== undefined) copyIf('missed_at', u.missedAt);
  if (u.lostAt !== undefined) copyIf('lost_at', u.lostAt);
  if (u.convertedAt !== undefined) copyIf('converted_at', u.convertedAt);
  if (u.importedAt !== undefined) copyIf('imported_at', u.importedAt);
  if (u.statusChangedAt !== undefined) copyIf('status_changed_at', u.statusChangedAt);
  if (u.pipelineStageChangedAt !== undefined) copyIf('pipeline_stage_changed_at', u.pipelineStageChangedAt);
  if (u.lastNoteAt !== undefined) copyIf('last_note_at', u.lastNoteAt);
  if (u.lastWhatsappActivityAt !== undefined) copyIf('last_whatsapp_activity_at', u.lastWhatsappActivityAt);

  if (u.whatsappIntention !== undefined) copyIf('whatsapp_intention', u.whatsappIntention);
  if (u.whatsappPriority !== undefined) copyIf('whatsapp_priority', u.whatsappPriority);
  if (u.whatsappLeadQuente !== undefined) copyIf('whatsapp_lead_quente', u.whatsappLeadQuente);
  if (u.needHuman !== undefined) copyIf('need_human', Boolean(u.needHuman));

  const nowIso = new Date().toISOString();
  if (typeof u.status !== 'undefined' && u.status !== currentLead.status) {
    patch.status_changed_at = nowIso;
  }
  if (typeof u.pipelineStage !== 'undefined' && u.pipelineStage !== currentLead.pipelineStage) {
    patch.pipeline_stage_changed_at = nowIso;
  }

  return patch;
}

export const useLeadStore = create((set, get) => ({
  leads: [],
  loading: false,
  loadingMore: false,
  leadsHasMore: false,
  leadsCursor: null,
  academyId: null,
  teamId: null,
  userId: null,
  labels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
  modules: { sales: false, inventory: false, finance: false },
  inboxUnreadConversations: 0,
  onboardingChecklist: null,
  billingAccess: null,
  academyList: [],
  onboardingChecklistReopenNonce: 0,

  setAcademyList: (list) => set({ academyList: Array.isArray(list) ? list : [] }),

  setAcademyId: (id) =>
    set({
      academyId: id,
      ...(id ? {} : { onboardingChecklist: null, billingAccess: null, academyList: [] })
    }),
  setBillingAccess: (v) => set({ billingAccess: v && typeof v === 'object' ? v : null }),
  reopenOnboardingBanner: () =>
    set((s) => ({ onboardingChecklistReopenNonce: (s.onboardingChecklistReopenNonce || 0) + 1 })),

  completeOnboardingStepIds: async (ids) => {
    const academyId = get().academyId;
    if (!academyId || !Array.isArray(ids) || ids.length === 0) return;
    const merged = mergeOnboardingStepIdsDone(get().onboardingChecklist, ids);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        onboardingChecklist: JSON.stringify(merged)
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
  setModules: (mods) => set({ modules: { ...get().modules, ...(mods || {}) } }),

  fetchLeads: async (opts = {}) => {
    const reset = opts.reset !== false;
    const academyId = get().academyId;
    if (!academyId) return;
    if (reset) {
      if (get().loading) return;
    } else {
      if (get().loadingMore || !get().leadsHasMore || !get().leadsCursor) return;
    }

    if (reset) set({ loading: true });
    else set({ loadingMore: true });

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
      const docs = response.documents || [];
      const leads = docs.map((doc) => mapAppwriteDocToLead(doc, operationalStatusSet));
      const lastId = docs.length ? docs[docs.length - 1].$id : null;
      const pageFull = docs.length === LEADS_PAGE_SIZE;

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

          return {
            leads: [...localsToKeep, ...leads],
            loading: false,
            leadsHasMore: pageFull,
            leadsCursor: pageFull && lastId ? lastId : null
          };
        });
      } else {
        set((state) => {
          const existingIds = new Set(state.leads.map((l) => l.id));
          const appended = leads.filter((l) => !existingIds.has(l.id));
          return {
            leads: [...state.leads, ...appended],
            loadingMore: false,
            leadsHasMore: pageFull,
            leadsCursor: pageFull && lastId ? lastId : null
          };
        });
      }
    } catch (e) {
      console.error('fetchLeads error:', e);
      set({ loading: false, loadingMore: false });
    }
  },

  fetchMoreLeads: async () => {
    await get().fetchLeads({ reset: false });
  },

  addLead: async (lead) => {
    const academyId = get().academyId;
    if (!academyId) return;

    try {
      const wasEmpty = get().leads.length === 0;
      const userId = get().userId;
      const permCtx = permissionContextFromStore(get);

      const academyList = get().academyList || [];
      const acadDoc = academyList.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
      const ownerId = acadDoc.ownerId || get().ownerId;
      const teamId = acadDoc.teamId || get().teamId;

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
      if (perms.length === 0) {
        if (userId) {
          perms.push(
            Permission.read(Role.user(userId)),
            Permission.update(Role.user(userId)),
            Permission.delete(Role.user(userId))
          );
        } else {
          perms.push(
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users())
          );
        }
      }

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
        notes: '',
        is_first_experience: lead.isFirstExperience || 'Sim',
        belt: lead.belt || '',
        custom_answers_json: JSON.stringify(lead.customAnswers || {}),
        birth_date: String(lead.birthDate || '').slice(0, 10),
        pipeline_stage: lead.pipelineStage || 'Novo',
        pipeline_stage_changed_at: nowIso,
        status_changed_at: nowIso
      };
      const bk = String(lead.borrowedKimono || '').trim();
      const bs = String(lead.borrowedShirt || '').trim();
      if (bk) docPayload.borrowed_kimono = bk.slice(0, 32);
      if (bs) docPayload.borrowed_shirt = bs.slice(0, 32);

      const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), docPayload, perms);

      await addLeadEvent({
        academyId,
        leadId: doc.$id,
        type: 'lead_criado',
        text: 'Lead criado',
        at: doc.$createdAt,
        createdBy: userId || 'user',
        permissionContext: permCtx
      });

      for (const ev of lead.notes || []) {
        if (ev && ev.type === 'note' && String(ev.text || '').trim()) {
          await addLeadEvent({
            academyId,
            leadId: doc.$id,
            type: 'note',
            text: String(ev.text).slice(0, 1000),
            at: ev.at || nowIso,
            createdBy: 'user',
            permissionContext: permCtx
          });
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

      set((state) => ({ leads: [newLead, ...state.leads] }));

      if (wasEmpty) {
        try {
          const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
          let checklist = [];
          try {
            if (acad.onboardingChecklist) {
              checklist =
                typeof acad.onboardingChecklist === 'string'
                  ? JSON.parse(acad.onboardingChecklist)
                  : acad.onboardingChecklist;
              if (!Array.isArray(checklist)) checklist = [];
            }
          } catch {
            checklist = [];
          }
          const merged = mergeOnboardingStepIdsDone(checklist, ['first_lead']);
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            onboardingChecklist: JSON.stringify(merged)
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

  updateLead: async (id, updates) => {
    try {
      const currentLead = get().leads.find((l) => l.id === id);
      if (!currentLead) return;

      const normalizedUpdates = { ...updates };
      if (
        normalizedUpdates.status === LEAD_STATUS.CONVERTED &&
        String(normalizedUpdates.contact_type || '').trim() !== 'student'
      ) {
        normalizedUpdates.contact_type = 'student';
      }
      if (Array.isArray(normalizedUpdates.label_ids)) {
        normalizedUpdates.labelIds = [...normalizedUpdates.label_ids];
      }

      const filtered = {};
      for (const [k, v] of Object.entries(normalizedUpdates)) {
        if (!CLIENT_ONLY_KEYS.has(k)) filtered[k] = v;
      }

      const patch = updatesToAppwritePatch(filtered, currentLead);

      delete patch.id;
      delete patch.createdAt;
      delete patch.notes;

      await databases.updateDocument(DB_ID, LEADS_COL, id, patch);

      const mergedLead = { ...currentLead, ...normalizedUpdates };
      if (typeof filtered.status !== 'undefined' && filtered.status !== currentLead.status) {
        mergedLead.statusChangedAt = patch.status_changed_at || mergedLead.statusChangedAt;
      }
      if (typeof filtered.pipelineStage !== 'undefined' && filtered.pipelineStage !== currentLead.pipelineStage) {
        mergedLead.pipelineStageChangedAt = patch.pipeline_stage_changed_at || mergedLead.pipelineStageChangedAt;
      }

      set((state) => ({
        leads: state.leads.map((l) => (l.id === id ? mergedLead : l))
      }));
    } catch (e) {
      console.error('updateLead error:', e);
      throw e;
    }
  },

  deleteLead: async (id) => {
    const previousLeads = get().leads;
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id)
    }));
    try {
      await databases.deleteDocument(DB_ID, LEADS_COL, id);
    } catch (e) {
      set({ leads: previousLeads });
      console.error('deleteLead error:', e);
      throw e;
    }
  },

  importLeads: async (leadsArray) => {
    const academyId = get().academyId;
    if (!academyId) return;

    const wasEmpty = get().leads.length === 0;
    const newLeads = [];
    const userId = get().userId;
    const teamId = get().teamId;
    const permCtx = permissionContextFromStore(get);
    const perms = [];
    if (userId) {
      perms.push(
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId))
      );
    }
    if (teamId) {
      perms.push(
        Permission.read(Role.team(teamId)),
        Permission.update(Role.team(teamId)),
        Permission.delete(Role.team(teamId))
      );
    }
    if (perms.length === 0) {
      perms.push(
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users())
      );
    }

    for (const lead of leadsArray) {
      try {
        const nowIso = new Date().toISOString();
        const contactType = String(lead.contact_type || '').trim() || 'lead';
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
            contact_type: contactType,
            origin: lead.origin || 'Planilha',
            status: lead.status || LEAD_STATUS.NEW,
            scheduledDate: lead.scheduledDate || '',
            scheduledTime: lead.scheduledTime || '',
            parentName: lead.parentName || '',
            age: lead.age || '',
            notes: '',
            academyId,
            pipeline_stage: lead.pipelineStage || 'Novo',
            imported_at: nowIso,
            status_changed_at: nowIso,
            pipeline_stage_changed_at: nowIso,
            birth_date: String(lead.birthDate || '').slice(0, 10),
            is_first_experience: lead.isFirstExperience || 'Sim',
            belt: lead.belt || '',
            custom_answers_json: JSON.stringify(lead.customAnswers || {})
          };
        const ibk = String(lead.borrowedKimono || '').trim();
        const ibs = String(lead.borrowedShirt || '').trim();
        if (ibk) importPayload.borrowed_kimono = ibk.slice(0, 32);
        if (ibs) importPayload.borrowed_shirt = ibs.slice(0, 32);

        const doc = await databases.createDocument(
          DB_ID,
          LEADS_COL,
          ID.unique(),
          importPayload,
          perms
        );

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

        newLeads.push({
          id: doc.$id,
          ...lead,
          contact_type: contactType,
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
    set((state) => ({ leads: [...newLeads, ...state.leads] }));

    if (wasEmpty && newLeads.length > 0) {
      try {
        const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        let checklist = [];
        try {
          if (acad.onboardingChecklist) {
            checklist =
              typeof acad.onboardingChecklist === 'string'
                ? JSON.parse(acad.onboardingChecklist)
                : acad.onboardingChecklist;
            if (!Array.isArray(checklist)) checklist = [];
          }
        } catch {
          checklist = [];
        }
        const merged = mergeOnboardingStepIdsDone(checklist, ['first_lead']);
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          onboardingChecklist: JSON.stringify(merged)
        });
        get().setOnboardingChecklist(merged);
      } catch (e) {
        console.warn('onboardingChecklist update failed (import):', e?.message || e);
      }
    }
  },

  getLeadById: (id) => get().leads.find((l) => l.id === id)
}));

if (typeof window !== 'undefined') {
  window.useLeadStore = useLeadStore;
}
