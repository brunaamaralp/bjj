import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyAutentiqueSignature,
  mapContractStatusFromEvent,
  mapSignerStatusFromEvent,
  extractAutentiqueDocumentId,
  extractSignerPublicId,
} from '../../lib/contracts/autentiqueWebhookHandler.ts';

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
  });

  it('extrai autentique_id do payload', () => {
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
});
