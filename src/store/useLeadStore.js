import { create } from 'zustand';
import { databases, DB_ID, LEADS_COL, ACADEMIES_COL } from '../lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';

export const LEAD_STATUS = {
  NEW: 'Novo',
  SCHEDULED: 'Agendado',
  COMPLETED: 'Compareceu',
  MISSED: 'Não Compareceu',
  CONVERTED: 'Matriculado',
  LOST: 'Não fechou'
};

export const LEAD_ORIGIN = ['Instagram', 'Indicação', 'WhatsApp', 'Passou na porta', 'Evento'];

export const LEADS_PAGE_SIZE = 200;

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

function mapAppwriteDocToLead(doc, operationalStatusSet) {
  let history = [];
  let isFirstExperience = 'Sim';
  let belt = '';
  let borrowedKimono = '';
  let borrowedShirt = '';
  let pipelineStage = '';
  let pipelineStageChangedAt = '';

  if (doc.notes) {
    try {
      const parsed = JSON.parse(doc.notes);
      if (Array.isArray(parsed)) {
        history = parsed;
      } else {
        history = parsed.history || [];
        isFirstExperience = parsed.isFirstExperience || 'Sim';
        belt = parsed.belt || '';
        borrowedKimono = parsed.borrowedKimono || '';
        borrowedShirt = parsed.borrowedShirt || '';
        pipelineStage = parsed.pipelineStage || '';
        pipelineStageChangedAt = parsed.pipelineStageChangedAt || '';
        const customAnswers = parsed.customAnswers || {};
        const intention = parsed.whatsappIntention || '';
        const priority = parsed.whatsappPriority || '';
        const hotLead = String(parsed.whatsappLeadQuente || parsed.priority || '').toLowerCase() === 'sim';
        const needHuman = String(parsed.needHuman || '').toLowerCase() === 'sim';
        const status = operationalStatusSet.has(doc.status) ? doc.status : LEAD_STATUS.NEW;
        const effectivePipelineStage = pipelineStage || (operationalStatusSet.has(doc.status) ? '' : doc.status) || 'Novo';
        return {
          id: doc.$id,
          name: doc.name,
          phone: doc.phone,
          type: doc.type || 'Adulto',
          origin: doc.origin || '',
          status,
          pipelineStage: effectivePipelineStage,
          scheduledDate: doc.scheduledDate || '',
          scheduledTime: doc.scheduledTime || '',
          parentName: doc.parentName || '',
          age: doc.age || '',
          birthDate: parsed.birthDate || doc.birthDate || '',
          notes: history,
          isFirstExperience,
          belt,
          borrowedKimono,
          borrowedShirt,
          customAnswers,
          intention,
          priority,
          hotLead,
          needHuman,
          statusChangedAt: parsed.statusChangedAt || doc.statusChangedAt || '',
          pipelineStageChangedAt: pipelineStageChangedAt || parsed.statusChangedAt || doc.$createdAt || '',
          createdAt: doc.$createdAt,
          lostReason: doc.lostReason || '',
          plan: doc.plan || '',
          enrollmentDate: doc.enrollmentDate || '',
          emergencyContact: doc.emergencyContact || '',
          emergencyPhone: doc.emergencyPhone || '',
        };
      }
    } catch {
      console.warn('Notes parse error, treating as empty history');
    }
  }

  const status = operationalStatusSet.has(doc.status) ? doc.status : LEAD_STATUS.NEW;
  const effectivePipelineStage = pipelineStage || (operationalStatusSet.has(doc.status) ? '' : doc.status) || 'Novo';
  return {
    id: doc.$id,
    name: doc.name,
    phone: doc.phone,
    type: doc.type || 'Adulto',
    origin: doc.origin || '',
    status,
    pipelineStage: effectivePipelineStage,
    scheduledDate: doc.scheduledDate || '',
    scheduledTime: doc.scheduledTime || '',
    parentName: doc.parentName || '',
    age: doc.age || '',
    birthDate: doc.birthDate || '',
    notes: history,
    isFirstExperience,
    belt,
    borrowedKimono,
    borrowedShirt,
    intention: '',
    priority: '',
    hotLead: false,
    needHuman: false,
    statusChangedAt: doc.statusChangedAt || '',
    pipelineStageChangedAt: doc.$createdAt,
    createdAt: doc.$createdAt,
    lostReason: doc.lostReason || '',
    plan: doc.plan || '',
    enrollmentDate: doc.enrollmentDate || '',
    emergencyContact: doc.emergencyContact || '',
    emergencyPhone: doc.emergencyPhone || '',
  };
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

  setAcademyId: (id) => set({ academyId: id }),
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
        Query.limit(LEADS_PAGE_SIZE),
      ];
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
            leadsCursor: pageFull && lastId ? lastId : null,
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
            leadsCursor: pageFull && lastId ? lastId : null,
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

    console.log('📝 addLead starting with LEADS_COL:', LEADS_COL);

    try {
      const wasEmpty = get().leads.length === 0;
      const userId = get().userId;
      const teamId = get().teamId;
      const perms = [];
      if (userId) perms.push(Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId)));
      if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
      if (perms.length === 0) perms.push(Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users()));

      const notesData = {
        history: lead.notes || [],
        isFirstExperience: lead.isFirstExperience || 'Sim',
        belt: lead.belt || '',
        borrowedKimono: lead.borrowedKimono || '',
        borrowedShirt: lead.borrowedShirt || '',
        customAnswers: lead.customAnswers || {},
        pipelineStage: lead.pipelineStage || 'Novo',
        pipelineStageChangedAt: new Date().toISOString(),
        statusChangedAt: new Date().toISOString(),
        birthDate: lead.birthDate || '',
      };

      // Só atributos da collection no Appwrite — nunca espalhar `lead` (ex.: birthDate fica em notes JSON).
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
        notes: JSON.stringify(notesData),
        academyId,
      };
      const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), docPayload, perms);

      const newLead = {
        id: doc.$id,
        ...lead,
        pipelineStage: lead.pipelineStage || 'Novo',
        notes: lead.notes || [],
        createdAt: doc.$createdAt,
        pipelineStageChangedAt: notesData.pipelineStageChangedAt,
        _isNew: true,
      };

      console.log('✅ addLead success:', newLead);
      set((state) => ({ leads: [newLead, ...state.leads] }));

      if (wasEmpty) {
        try {
          const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
          let checklist = [];
          try {
            if (acad.onboardingChecklist) {
              checklist = typeof acad.onboardingChecklist === 'string' ? JSON.parse(acad.onboardingChecklist) : acad.onboardingChecklist;
              if (!Array.isArray(checklist)) checklist = [];
            }
          } catch { checklist = []; }
          const updated = checklist.map(it => it.id === 'first_lead' ? { ...it, done: true } : it);
          // If first_lead not present (older academies), append done item.
          if (!updated.find(it => it.id === 'first_lead')) {
            updated.push({ id: 'first_lead', title: 'Criar primeiro lead', done: true });
          }
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            onboardingChecklist: JSON.stringify(updated)
          });
        } catch (e) {
          console.warn('onboardingChecklist update failed:', e?.message || e);
        }
      }
      return newLead;
    } catch (e) {
      console.error('❌ addLead error:', e);
      throw e; // Rethrow to allow handling in the UI
    }
  },

  updateLead: async (id, updates) => {
    try {
      const currentLead = get().leads.find(l => l.id === id);
      if (!currentLead) return;

      const normalizedUpdates = { ...updates };
      if (
        normalizedUpdates.status === LEAD_STATUS.CONVERTED &&
        String(normalizedUpdates.contact_type || '').trim() !== 'student'
      ) {
        normalizedUpdates.contact_type = 'student';
      }

      const mergedLead = { ...currentLead, ...normalizedUpdates };

      // Pack metadata into notes for storage
      const notesData = {
        history: mergedLead.notes || [],
        isFirstExperience: mergedLead.isFirstExperience || 'Sim',
        belt: mergedLead.belt || '',
        borrowedKimono: mergedLead.borrowedKimono || '',
        borrowedShirt: mergedLead.borrowedShirt || '',
        customAnswers: mergedLead.customAnswers || {},
        pipelineStage: mergedLead.pipelineStage || 'Novo',
        pipelineStageChangedAt: currentLead.pipelineStageChangedAt || '',
        statusChangedAt: currentLead.statusChangedAt || '',
        birthDate: mergedLead.birthDate ?? currentLead.birthDate ?? '',
      };

      if (typeof normalizedUpdates.status !== 'undefined' && normalizedUpdates.status !== currentLead.status) {
        notesData.statusChangedAt = new Date().toISOString();
      }
      if (typeof normalizedUpdates.pipelineStage !== 'undefined' && normalizedUpdates.pipelineStage !== currentLead.pipelineStage) {
        notesData.pipelineStageChangedAt = new Date().toISOString();
      }

      const payload = {
        ...normalizedUpdates,
        notes: JSON.stringify(notesData)
      };

      // Remove fields Appwrite doesn't expect or that shouldn't be in the payload
      delete payload.id;
      delete payload.createdAt;
      delete payload.isFirstExperience;
      delete payload.belt;
      delete payload.borrowedKimono;
      delete payload.borrowedShirt;
      delete payload.customAnswers;
      delete payload.pipelineStage;
      delete payload.statusChangedAt;
      delete payload.birthDate;

      await databases.updateDocument(DB_ID, LEADS_COL, id, payload);

      set((state) => ({
        leads: state.leads.map((l) =>
          l.id === id ? { ...l, ...normalizedUpdates, statusChangedAt: notesData.statusChangedAt, pipelineStageChangedAt: notesData.pipelineStageChangedAt } : l
        ),
      }));
    } catch (e) {
      console.error('updateLead error:', e);
      throw e; // Rethrow to allow handling in the UI
    }
  },

  deleteLead: async (id) => {
    const previousLeads = get().leads;
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id),
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
    const perms = [];
    if (userId) perms.push(Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId)));
    if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
    if (perms.length === 0) perms.push(Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users()));
    for (const lead of leadsArray) {
      try {
        const nowIso = new Date().toISOString();
        const history = [{ type: 'import', source: 'Planilha', at: nowIso, by: 'system' }];
        // `contact_type` define a identidade do cadastro; `status` continua sendo etapa do funil.
        const contactType = String(lead.contact_type || '').trim() || 'lead';
        
        const phone = lead.phone || '';
        const name = lead.name || '';
        
        // Local check first
        const existsLocally = get().leads.find(l => normalizePhone(l.phone) === normalizePhone(phone) && String(l.name).toLowerCase() === String(name).toLowerCase());
        if (existsLocally) {
           console.log('Skipping duplicate lead in import:', name);
           continue;
        }

        const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), {
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
          notes: JSON.stringify({ 
            history, 
            pipelineStage: lead.pipelineStage || 'Novo', 
            pipelineStageChangedAt: nowIso, 
            statusChangedAt: nowIso,
            birthDate: lead.birthDate || '',
          }),
          academyId,
        }, perms);
        newLeads.push({
          id: doc.$id,
          ...lead,
          contact_type: contactType,
          pipelineStage: lead.pipelineStage || 'Novo',
          notes: history,
          createdAt: doc.$createdAt,
          pipelineStageChangedAt: nowIso,
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
            checklist = typeof acad.onboardingChecklist === 'string' ? JSON.parse(acad.onboardingChecklist) : acad.onboardingChecklist;
            if (!Array.isArray(checklist)) checklist = [];
          }
        } catch { checklist = []; }
        const updated = checklist.map(it => it.id === 'first_lead' ? { ...it, done: true } : it);
        if (!updated.find(it => it.id === 'first_lead')) {
          updated.push({ id: 'first_lead', title: 'Criar primeiro lead', done: true });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          onboardingChecklist: JSON.stringify(updated)
        });
      } catch (e) {
        console.warn('onboardingChecklist update failed (import):', e?.message || e);
      }
    }
  },

  getLeadById: (id) => get().leads.find((l) => l.id === id),
}));

// Debug exposure
if (typeof window !== 'undefined') {
  window.useLeadStore = useLeadStore;
  console.log('🥋 useLeadStore exposed to window');
}
