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
      const leads = response.documents.map(doc => ({
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
        notes: doc.notes ? JSON.parse(doc.notes) : [],
        createdAt: doc.$createdAt,
      }));
      set({ leads, loading: false });
    } catch (e) {
      console.error('fetchLeads error:', e);
      set({ loading: false });
    }
  },

  addLead: async (lead) => {
    const academyId = get().academyId;
    if (!academyId) return;

    try {
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
        notes: lead.notes ? JSON.stringify(lead.notes) : '',
        academyId,
      });

      const newLead = {
        id: doc.$id,
        ...lead,
        notes: lead.notes || [],
        createdAt: doc.$createdAt,
      };

      set((state) => ({ leads: [newLead, ...state.leads] }));
    } catch (e) {
      console.error('addLead error:', e);
    }
  },

  updateLead: async (id, updates) => {
    try {
      const payload = { ...updates };
      if (payload.notes) {
        payload.notes = JSON.stringify(payload.notes);
      }
      // Remove fields Appwrite doesn't expect
      delete payload.id;
      delete payload.createdAt;

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
