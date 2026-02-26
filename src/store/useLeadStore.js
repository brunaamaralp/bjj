import { create } from 'zustand';
import { databases, DB_ID, LEADS_COL } from '../lib/appwrite';
import { ID, Query } from 'appwrite';

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

  setAcademyId: (id) => set({ academyId: id }),

  fetchLeads: async () => {
    const academyId = get().academyId;
    if (!academyId) return;

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
            }
          } catch (e) {
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
          createdAt: doc.$createdAt,
        };
      });

      set((state) => {
        // Prevent race condition: keep local leads created in the last 2 mins 
        // that are not yet in the server response
        const serverIds = new Set(leads.map(l => l.id));
        const now = new Date();
        const recentLocals = state.leads.filter(l => {
          const created = new Date(l.createdAt);
          const isRecentlyCreated = (now - created) < 120000; // 2 minutes
          return !serverIds.has(l.id) && isRecentlyCreated;
        });

        return {
          leads: [...recentLocals, ...leads],
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

    try {
      // Pack metadata into notes
      const notesData = {
        history: lead.notes || [],
        isFirstExperience: lead.isFirstExperience || 'Sim',
        belt: lead.belt || '',
        borrowedKimono: lead.borrowedKimono || '',
        borrowedShirt: lead.borrowedShirt || ''
      };

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
        academyId,
      });

      const newLead = {
        id: doc.$id,
        ...lead,
        notes: lead.notes || [],
        createdAt: doc.$createdAt,
      };

      console.log('✅ addLead success:', newLead);
      set((state) => ({ leads: [newLead, ...state.leads] }));
    } catch (e) {
      console.error('❌ addLead error:', e);
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
          l.id === id ? { ...l, ...updates } : l
        ),
      }));
    } catch (e) {
      console.error('updateLead error:', e);
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

    const newLeads = [];
    for (const lead of leadsArray) {
      try {
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
          notes: '',
          academyId,
        });
        newLeads.push({
          id: doc.$id,
          ...lead,
          notes: [],
          createdAt: doc.$createdAt,
        });
      } catch (e) {
        console.error('import error for', lead.name, e);
      }
    }
    set((state) => ({ leads: [...newLeads, ...state.leads] }));
  },

  getLeadById: (id) => get().leads.find((l) => l.id === id),
}));

// Debug exposure
if (typeof window !== 'undefined') {
  window.useLeadStore = useLeadStore;
  console.log('🥋 useLeadStore exposed to window');
}
