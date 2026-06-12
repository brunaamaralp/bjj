import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore.js';

const DEFAULT_MANUAL = {
  name: '',
  phone: '',
  scheduledDate: '',
  scheduledTime: '',
};

export const AUTOMATION_PREVIEW_FALLBACK_LEAD = {
  name: 'Maria Silva',
  scheduledDate: '2026-06-15',
  scheduledTime: '19:00',
};

export function automationPreviewLeadStorageKey(academyId) {
  return `navi_automacoes_preview_lead_v1_${String(academyId || '').trim()}`;
}

function loadStoredPreview(academyId) {
  if (!academyId) {
    return { sampleLeadId: '', sampleManual: { ...DEFAULT_MANUAL } };
  }
  try {
    const raw = sessionStorage.getItem(automationPreviewLeadStorageKey(academyId));
    if (!raw) return { sampleLeadId: '', sampleManual: { ...DEFAULT_MANUAL } };
    const parsed = JSON.parse(raw);
    return {
      sampleLeadId: String(parsed?.sampleLeadId || ''),
      sampleManual: { ...DEFAULT_MANUAL, ...(parsed?.sampleManual || {}) },
    };
  } catch {
    return { sampleLeadId: '', sampleManual: { ...DEFAULT_MANUAL } };
  }
}

function saveStoredPreview(academyId, { sampleLeadId, sampleManual }) {
  if (!academyId) return;
  try {
    sessionStorage.setItem(
      automationPreviewLeadStorageKey(academyId),
      JSON.stringify({ sampleLeadId, sampleManual })
    );
  } catch {
    void 0;
  }
}

/** Estado compartilhado para pré-visualizar templates/automações com lead real ou manual. */
export function useAutomationPreviewLead() {
  const academyId = useLeadStore((s) => s.academyId);
  const leads = useLeadStore((s) => s.leads);

  const [sampleLeadId, setSampleLeadIdState] = useState('');
  const [sampleManual, setSampleManualState] = useState(DEFAULT_MANUAL);

  useEffect(() => {
    const stored = loadStoredPreview(academyId);
    setSampleLeadIdState(stored.sampleLeadId);
    setSampleManualState(stored.sampleManual);
  }, [academyId]);

  useEffect(() => {
    saveStoredPreview(academyId, { sampleLeadId, sampleManual });
  }, [academyId, sampleLeadId, sampleManual]);

  const setSampleLeadId = useCallback((id) => {
    setSampleLeadIdState(id);
  }, []);

  const setSampleManual = useCallback((updater) => {
    setSampleManualState(updater);
  }, []);

  const sampleLead = useMemo(() => {
    const id = String(sampleLeadId || '').trim();
    if (id === '_manual') return null;
    return leads.find((l) => l.id === id) || leads[0] || null;
  }, [leads, sampleLeadId]);

  const sampleData = useMemo(() => {
    if (sampleLead) return sampleLead;
    if (sampleLeadId === '_manual' || leads.length === 0) {
      return {
        name: sampleManual.name,
        phone: sampleManual.phone,
        scheduledDate: sampleManual.scheduledDate,
        scheduledTime: sampleManual.scheduledTime,
      };
    }
    return { ...AUTOMATION_PREVIEW_FALLBACK_LEAD };
  }, [sampleLead, sampleLeadId, sampleManual, leads.length]);

  return {
    leads,
    sampleLeadId,
    setSampleLeadId,
    sampleManual,
    setSampleManual,
    sampleLead,
    sampleData,
  };
}
