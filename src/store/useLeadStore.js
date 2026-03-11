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

export const useLeadStore = create((set, get) => ({
  leads: [],
  loading: false,
  academyId: null,
  teamId: null,
  labels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas' },
  modules: { sales: false, inventory: false, finance: false },

  setAcademyId: (id) => set({ academyId: id }),
  setTeamId: (id) => set({ teamId: id }),
  setLabels: (labels) => set({ labels: { ...get().labels, ...(labels || {}) } }),
  setModules: (mods) => set({ modules: { ...get().modules, ...(mods || {}) } }),

  fetchLeads: async () => {
    const academyId = get().academyId;
    if (!academyId) return;
    if (get().loading) return;

    set({ loading: true });
    try {
      const response = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('academyId', academyId),
        Query.limit(500),
        Query.orderDesc('$createdAt'),
      ]);
      const leads = response.documents.map(doc => {
        let history = [];
        let isFirstExperience = 'Sim';
        let belt = '';
        let borrowedKimono = '';
        let borrowedShirt = '';

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
              const customAnswers = parsed.customAnswers || {};
              return {
                id: doc.$id,
                name: doc.name,
                phone: doc.phone,
                type: doc.type || 'Adulto',
                origin: doc.origin || '',
                status: doc.status,
                scheduledDate: doc.scheduledDate || '',
                scheduledTime: doc.scheduledTime || '',
                parentName: doc.parentName || '',
                age: doc.age || '',
                notes: history,
                isFirstExperience,
                belt,
                borrowedKimono,
                borrowedShirt,
                customAnswers,
                statusChangedAt: doc.statusChangedAt || '',
                createdAt: doc.$createdAt,
              };
            }
          } catch {
            console.warn('Notes parse error, treating as empty history');
          }
        }

        return {
          id: doc.$id,
          name: doc.name,
          phone: doc.phone,
          type: doc.type || 'Adulto',
          origin: doc.origin || '',
          status: doc.status,
          scheduledDate: doc.scheduledDate || '',
          scheduledTime: doc.scheduledTime || '',
          parentName: doc.parentName || '',
          age: doc.age || '',
          notes: history,
          isFirstExperience,
          belt,
          borrowedKimono,
          borrowedShirt,
          statusChangedAt: doc.statusChangedAt || '',
          createdAt: doc.$createdAt,
        };
      });

      set((state) => {
        const serverIds = new Set(leads.map(l => l.id));
        const now = new Date();
        const localsToKeep = state.leads.filter(l => {
          if (!l._isNew) return false;
          const created = new Date(l.createdAt);
          const isRecentlyCreated = (now - created) < 300000; // 5 minutes
          return !serverIds.has(l.id) && isRecentlyCreated;
        });

        return {
          leads: [...localsToKeep, ...leads],
          loading: false
        };
      });
    } catch (e) {
      console.error('fetchLeads error:', e);
      set({ loading: false });
    }
  },

  addLead: async (lead) => {
    const academyId = get().academyId;
    if (!academyId) return;

    console.log('📝 addLead starting with LEADS_COL:', LEADS_COL);

    try {
      const wasEmpty = get().leads.length === 0;
      // Pack metadata into notes
      const notesData = {
        history: lead.notes || [],
        isFirstExperience: lead.isFirstExperience || 'Sim',
        belt: lead.belt || '',
        borrowedKimono: lead.borrowedKimono || '',
        borrowedShirt: lead.borrowedShirt || '',
        customAnswers: lead.customAnswers || {}
      };
      const teamId = get().teamId;
      const perms = teamId ? [
        Permission.read(Role.team(teamId)),
        Permission.update(Role.team(teamId, 'owner')),
        Permission.delete(Role.team(teamId, 'owner')),
      ] : undefined;

      const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), {
        name: lead.name,
        phone: lead.phone,
        type: lead.type || 'Adulto',
        origin: lead.origin || '',
        status: lead.status || LEAD_STATUS.NEW,
        scheduledDate: lead.scheduledDate || '',
        scheduledTime: lead.scheduledTime || '',
        parentName: lead.parentName || '',
        age: lead.age || '',
        notes: JSON.stringify(notesData),
        statusChangedAt: new Date().toISOString(),
        academyId,
      }, perms);

      const newLead = {
        id: doc.$id,
        ...lead,
        notes: lead.notes || [],
        createdAt: doc.$createdAt,
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
    } catch (e) {
      console.error('❌ addLead error:', e);
      throw e; // Rethrow to allow handling in the UI
    }
  },

  updateLead: async (id, updates) => {
    try {
      const currentLead = get().leads.find(l => l.id === id);
      if (!currentLead) return;

      const mergedLead = { ...currentLead, ...updates };

      // Pack metadata into notes for storage
      const notesData = {
        history: mergedLead.notes || [],
        isFirstExperience: mergedLead.isFirstExperience || 'Sim',
        belt: mergedLead.belt || '',
        borrowedKimono: mergedLead.borrowedKimono || '',
        borrowedShirt: mergedLead.borrowedShirt || ''
      };

      const payload = {
        ...updates,
        notes: JSON.stringify(notesData)
      };
      if (typeof updates.status !== 'undefined' && updates.status !== currentLead.status) {
        payload.statusChangedAt = new Date().toISOString();
      }

      // Remove fields Appwrite doesn't expect or that shouldn't be in the payload
      delete payload.id;
      delete payload.createdAt;
      delete payload.isFirstExperience;
      delete payload.belt;
      delete payload.borrowedKimono;
      delete payload.borrowedShirt;

      await databases.updateDocument(DB_ID, LEADS_COL, id, payload);

      set((state) => ({
        leads: state.leads.map((l) =>
          l.id === id ? { ...l, ...updates, ...(payload.statusChangedAt ? { statusChangedAt: payload.statusChangedAt } : {}) } : l
        ),
      }));
    } catch (e) {
      console.error('updateLead error:', e);
      throw e; // Rethrow to allow handling in the UI
    }
  },

  deleteLead: async (id) => {
    try {
      await databases.deleteDocument(DB_ID, LEADS_COL, id);
      set((state) => ({
        leads: state.leads.filter((l) => l.id !== id),
      }));
    } catch (e) {
      console.error('deleteLead error:', e);
    }
  },

  importLeads: async (leadsArray) => {
    const academyId = get().academyId;
    if (!academyId) return;

    const wasEmpty = get().leads.length === 0;
    const newLeads = [];
    const teamId = get().teamId;
    const perms = teamId ? [
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId, 'owner')),
      Permission.delete(Role.team(teamId, 'owner')),
    ] : undefined;
    for (const lead of leadsArray) {
      try {
        const nowIso = new Date().toISOString();
        const history = [{ type: 'import', source: 'Planilha', at: nowIso, by: 'system' }];
        const doc = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), {
          name: lead.name,
          phone: lead.phone || '',
          type: lead.type || 'Adulto',
          origin: lead.origin || 'Planilha',
          status: lead.status || LEAD_STATUS.NEW,
          scheduledDate: lead.scheduledDate || '',
          scheduledTime: lead.scheduledTime || '',
          parentName: lead.parentName || '',
          age: lead.age || '',
          notes: JSON.stringify({ history }),
          statusChangedAt: nowIso,
          academyId,
        }, perms);
        newLeads.push({
          id: doc.$id,
          ...lead,
          notes: history,
          createdAt: doc.$createdAt,
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
