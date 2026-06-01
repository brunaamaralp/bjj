import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyAutentiqueSignature,
  mapContractStatusFromEvent,
  mapSignerStatusFromEvent,
  extractAutentiqueDocumentId,
  extractSignerPublicId,
  extractSignerSignedAt,
} from '../../lib/contracts/autentiqueWebhookHandler.ts';
import { mapAutentiqueToLeadEventType } from '../../lib/contracts/contractLeadEvents.js';
import { mapContractDisplayStatus } from '../../lib/contracts/displayStatus.ts';

/** Payload simplificado de document.updated (doc Autentique). */
const DOCUMENT_UPDATED_OFFICIAL = {
  event: {
    type: 'document.updated',
    data: {
      object: {
        id: '89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993',
        object: 'document',
        name: 'Contrato teste',
      },
      previous_attributes: { name: 'teste' },
    },
  },
};

/** Payload simplificado de signature.accepted (doc Autentique). */
const SIGNATURE_ACCEPTED_OFFICIAL = {
  event: {
    type: 'signature.accepted',
    data: {
      public_id: 'f8911dcd-dfcd-11ef-9465-42010a2b610e',
      object: 'signature',
      document: 'f48a8b465d02dd87559e08f06c41e3b6d548c4d7ad835eb0f',
      signed: '2025-01-31T12:22:30.000000Z',
      user: {
        name: 'João Silva',
        email: 'joao@example.com',
      },
    },
  },
};

describe('verifyAutentiqueSignature', () => {
  it('valida HMAC SHA256 do corpo bruto', () => {
    const secret = 'test-secret';
    const rawBody = JSON.stringify({ event: { type: 'document.finished' } });
    const signature = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    expect(verifyAutentiqueSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyAutentiqueSignature(rawBody, 'deadbeef', secret)).toBe(false);
  });
});

describe('event mapping', () => {
  it('mapeia status de documento e assinatura', () => {
    expect(mapContractStatusFromEvent('document.finished')).toBe('finished');
    expect(mapSignerStatusFromEvent('signature.accepted')).toBe('signed');
    expect(mapSignerStatusFromEvent('signature.delivery_failed')).toBe('delivery_failed');
  });

  it('extrai autentique_id do payload oficial (documento aninhado)', () => {
    expect(extractAutentiqueDocumentId(DOCUMENT_UPDATED_OFFICIAL)).toBe(
      '89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993'
    );
  });

  it('extrai autentique_id do payload oficial (assinatura)', () => {
    expect(extractAutentiqueDocumentId(SIGNATURE_ACCEPTED_OFFICIAL)).toBe(
      'f48a8b465d02dd87559e08f06c41e3b6d548c4d7ad835eb0f'
    );
    expect(extractSignerPublicId(SIGNATURE_ACCEPTED_OFFICIAL)).toBe('f8911dcd-dfcd-11ef-9465-42010a2b610e');
    expect(extractSignerSignedAt(SIGNATURE_ACCEPTED_OFFICIAL)).toBe('2025-01-31T12:22:30.000000Z');
    expect(
      extractSignerSignedAt({
        event: {
          type: 'signature.accepted',
          data: { signed: { created_at: '2025-02-01T10:00:00.000000Z' } },
        },
      })
    ).toBe('2025-02-01T10:00:00.000000Z');
  });

  it('extrai autentique_id do payload legado achatado', () => {
    const docPayload = {
      event: { type: 'document.updated', data: { object: 'document', id: 'doc-abc' } },
    };
    expect(extractAutentiqueDocumentId(docPayload)).toBe('doc-abc');

    const sigPayload = {
      event: {
        type: 'signature.accepted',
        data: { object: 'signature', document: 'doc-xyz', public_id: 'sig-1' },
      },
    };
    expect(extractAutentiqueDocumentId(sigPayload)).toBe('doc-xyz');
    expect(extractSignerPublicId(sigPayload)).toBe('sig-1');
  });

  it('mapeia eventos tipados de lead', () => {
    expect(mapAutentiqueToLeadEventType('signature.accepted', null)).toBe('contract_signed');
    expect(mapAutentiqueToLeadEventType('signature.viewed', null)).toBe('contract_viewed');
    expect(mapAutentiqueToLeadEventType('signature.accepted', 'signed_after_offboarding')).toBe(
      'signed_after_offboarding'
    );
    expect(mapAutentiqueToLeadEventType('document.deleted', null)).toBe('contract_expired');
  });

  it('exibe status expirado após prazo', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      mapContractDisplayStatus('pending', 0, 1, { expiresAt: past, signersViewed: 0 })
    ).toBe('expired');
    expect(mapContractDisplayStatus('pending', 0, 1, { signersViewed: 1 })).toBe('viewed');
    expect(mapContractDisplayStatus('finished', 1, 1, {})).toBe('signed');
    expect(mapContractDisplayStatus('in_progress', 1, 2, {})).toBe('viewed');
  });
});
