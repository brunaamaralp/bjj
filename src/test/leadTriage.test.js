import { describe, it, expect } from 'vitest';
import { isInboundAutoLead, isLeadPendingTriage, LEAD_TRIAGE_STATUS } from '../lib/leadTriage.js';

describe('leadTriage', () => {
  it('detecta lead inbound automático', () => {
    expect(isInboundAutoLead({ inboundAuto: true })).toBe(true);
    expect(isInboundAutoLead({ inbound_auto: 'true' })).toBe(true);
    expect(isInboundAutoLead({ origin: 'WhatsApp' })).toBe(false);
  });

  it('pending quando triage_status é pending', () => {
    expect(isLeadPendingTriage({ triageStatus: LEAD_TRIAGE_STATUS.PENDING })).toBe(true);
  });

  it('não pending após confirmado', () => {
    expect(isLeadPendingTriage({ triageStatus: LEAD_TRIAGE_STATUS.CONFIRMED, inboundAuto: true })).toBe(false);
  });

  it('pending para inbound auto sem confirmação', () => {
    expect(isLeadPendingTriage({ inboundAuto: true })).toBe(true);
  });

  it('lead manual comum não entra em triagem', () => {
    expect(isLeadPendingTriage({ origin: 'WhatsApp', pipelineStage: 'Novo' })).toBe(false);
  });
});
