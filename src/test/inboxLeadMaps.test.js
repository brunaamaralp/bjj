import { describe, it, expect } from 'vitest';
import {
  buildInboxLeadMaps,
  buildLeadsByPhoneIndex,
  collectVisibleLeadKeys,
  extractEmbeddedLeadsFromItems,
  fingerprintInboxLeadMaps,
  leadInboxFingerprint,
} from '../lib/inboxLeadMaps.js';

const normalizePhone = (v) => String(v || '').replace(/\D/g, '');

describe('inboxLeadMaps', () => {
  const leadsById = {
    l1: {
      id: 'l1',
      name: 'Maria',
      phone: '5511999999999',
      hotLead: true,
      priority: 'alta',
      status: 'novo',
      pipelineStage: 'Novo',
    },
    l2: {
      id: 'l2',
      name: 'João',
      phone: '5511888888888',
      hotLead: false,
      status: 'contato',
      pipelineStage: 'Contato',
    },
  };

  it('collectVisibleLeadKeys inclui itens e telefone selecionado', () => {
    const keys = collectVisibleLeadKeys(
      [
        { lead_id: 'l1', phone_number: '5511999999999' },
        { phone_number: '5511777777777' },
      ],
      '5511888888888',
      normalizePhone
    );
    expect(keys.leadIds).toEqual(['l1']);
    expect(keys.phones).toContain('5511999999999');
    expect(keys.phones).toContain('5511777777777');
    expect(keys.phones).toContain('5511888888888');
  });

  it('buildInboxLeadMaps resolve por lead_id e por phone', () => {
    const keys = collectVisibleLeadKeys(
      [{ lead_id: 'l1', phone_number: '5511999999999' }, { phone_number: '5511888888888' }],
      '',
      normalizePhone
    );
    const { leadById, leadByPhone } = buildInboxLeadMaps(leadsById, keys);
    expect(leadById.get('l1')?.name).toBe('Maria');
    expect(leadByPhone.get('5511888888888')?.name).toBe('João');
    expect(leadById.get('l2')?.name).toBe('João');
  });

  it('fingerprint estável quando lead visível não muda', () => {
    const keys = collectVisibleLeadKeys([{ lead_id: 'l1', phone_number: '5511999999999' }], '', normalizePhone);
    const mapsA = buildInboxLeadMaps(leadsById, keys);
    const mapsB = buildInboxLeadMaps(leadsById, keys);
    const fpA = fingerprintInboxLeadMaps(mapsA.leadById, mapsA.leadByPhone, keys);
    const fpB = fingerprintInboxLeadMaps(mapsB.leadById, mapsB.leadByPhone, keys);
    expect(fpA).toBe(fpB);
    expect(fpA).toContain('Maria');
  });

  it('fingerprint muda quando campo relevante do lead muda', () => {
    const keys = collectVisibleLeadKeys([{ lead_id: 'l1', phone_number: '5511999999999' }], '', normalizePhone);
    const before = buildInboxLeadMaps(leadsById, keys);
    const updated = {
      ...leadsById,
      l1: { ...leadsById.l1, hotLead: false },
    };
    const after = buildInboxLeadMaps(updated, keys);
    const fpBefore = fingerprintInboxLeadMaps(before.leadById, before.leadByPhone, keys);
    const fpAfter = fingerprintInboxLeadMaps(after.leadById, after.leadByPhone, keys);
    expect(fpBefore).not.toBe(fpAfter);
  });

  it('buildLeadsByPhoneIndex inclui variantes BR', () => {
    const idx = buildLeadsByPhoneIndex({
      l1: { id: 'l1', phone: '11999999999' },
    });
    expect(idx.get('11999999999')?.id).toBe('l1');
    expect(idx.get('5511999999999')?.id).toBe('l1');
  });

  it('leadInboxFingerprint vazio para lead ausente', () => {
    expect(leadInboxFingerprint(null)).toBe('');
  });

  it('extractEmbeddedLeadsFromItems lê lead da API', () => {
    const byId = extractEmbeddedLeadsFromItems([
      { phone_number: '5511999999999', lead: { id: 'l1', name: 'Maria' } },
      { phone_number: '5511888888888' },
    ]);
    expect(byId.l1?.name).toBe('Maria');
    expect(Object.keys(byId)).toHaveLength(1);
  });
});
