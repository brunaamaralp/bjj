import { create } from 'zustand';
import { account } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { friendlyError } from '../lib/errorMessages.js';

async function authHeaders(academyId) {
  const jwt = await account.createJWT();
  return {
    Authorization: `Bearer ${jwt.jwt}`,
    'x-academy-id': String(academyId || '').trim(),
    'content-type': 'application/json',
  };
}

export const useWhatsappTemplatesStore = create((set, get) => ({
  byAcademy: {},

  async fetch(academyId, { force = false } = {}) {
    const id = String(academyId || '').trim();
    if (!id) return null;
    const cached = get().byAcademy[id];
    if (!force && cached?.templates && !cached.loading) return cached;

    set((s) => ({
      byAcademy: {
        ...s.byAcademy,
        [id]: { ...(s.byAcademy[id] || {}), loading: true, error: null },
      },
    }));

    try {
      const headers = await authHeaders(id);
      const resp = await fetch('/api/academy/whatsapp-templates', { headers });
      const raw = await resp.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = {};
      }
      if (!resp.ok) throw new Error(data?.erro || 'Falha ao carregar templates');

      const entry = {
        templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...(data.templates || {}) },
        archive: data.archive || {},
        automationsRaw: String(data.automations_config || ''),
        academyName: String(data.academy_name || '').trim(),
        zapsterInstanceId: String(data.zapster_instance_id || '').trim(),
        updatedAt: data.updated_at || null,
        updatedBy: data.updated_by || null,
        loading: false,
        error: null,
        fetchedAt: Date.now(),
      };
      set((s) => ({ byAcademy: { ...s.byAcademy, [id]: entry } }));
      return entry;
    } catch (e) {
      const entry = {
        templates: { ...DEFAULT_WHATSAPP_TEMPLATES },
        archive: {},
        automationsRaw: '',
        academyName: '',
        loading: false,
        error: friendlyError(e, 'load'),
        fetchedAt: Date.now(),
      };
      set((s) => ({ byAcademy: { ...s.byAcademy, [id]: entry } }));
      return entry;
    }
  },

  invalidate(academyId) {
    const id = String(academyId || '').trim();
    if (!id) return;
    set((s) => {
      const next = { ...s.byAcademy };
      delete next[id];
      return { byAcademy: next };
    });
  },

  patchLocal(academyId, partial) {
    const id = String(academyId || '').trim();
    if (!id) return;
    set((s) => ({
      byAcademy: {
        ...s.byAcademy,
        [id]: { ...(s.byAcademy[id] || {}), ...partial },
      },
    }));
  },
}));
