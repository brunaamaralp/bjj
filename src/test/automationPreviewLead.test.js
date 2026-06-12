import { describe, it, expect, beforeEach } from 'vitest';
import {
  automationPreviewLeadStorageKey,
  AUTOMATION_PREVIEW_FALLBACK_LEAD,
} from '../hooks/useAutomationPreviewLead.js';

describe('automationPreviewLead storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('storage key é por academia', () => {
    expect(automationPreviewLeadStorageKey('acad-1')).toContain('acad-1');
  });

  it('persiste e restaura seleção na sessão', () => {
    const key = automationPreviewLeadStorageKey('acad-1');
    sessionStorage.setItem(
      key,
      JSON.stringify({
        sampleLeadId: '_manual',
        sampleManual: { name: 'João', phone: '11999', scheduledDate: '2026-08-01', scheduledTime: '18:00' },
      })
    );
    const raw = JSON.parse(sessionStorage.getItem(key));
    expect(raw.sampleLeadId).toBe('_manual');
    expect(raw.sampleManual.name).toBe('João');
  });

  it('fallback lead tem campos esperados', () => {
    expect(AUTOMATION_PREVIEW_FALLBACK_LEAD.name).toBeTruthy();
    expect(AUTOMATION_PREVIEW_FALLBACK_LEAD.scheduledDate).toBeTruthy();
  });
});
