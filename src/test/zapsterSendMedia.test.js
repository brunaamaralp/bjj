import { describe, it, expect } from 'vitest';
import { buildZapsterMediaPayload, detectMediaTypeFromMime } from '../../lib/server/zapsterSend.js';

describe('zapsterSend media', () => {
  it('detecta tipo por mime', () => {
    expect(detectMediaTypeFromMime('image/png')).toBe('image');
    expect(detectMediaTypeFromMime('audio/ogg')).toBe('audio');
    expect(detectMediaTypeFromMime('application/pdf')).toBe('document');
  });

  it('monta payload de imagem com caption', () => {
    expect(
      buildZapsterMediaPayload({
        mediaUrl: 'https://cdn.example/a.jpg',
        mimeType: 'image/jpeg',
        caption: 'Olá'
      })
    ).toEqual({
      url: 'https://cdn.example/a.jpg',
      caption: 'Olá'
    });
  });

  it('monta payload de áudio com ptt', () => {
    expect(
      buildZapsterMediaPayload({
        mediaUrl: 'https://cdn.example/a.ogg',
        mimeType: 'audio/ogg'
      })
    ).toEqual({
      url: 'https://cdn.example/a.ogg',
      ptt: true
    });
  });

  it('monta payload de documento com fileName', () => {
    expect(
      buildZapsterMediaPayload({
        mediaUrl: 'https://cdn.example/doc.pdf',
        mimeType: 'application/pdf',
        fileName: 'contrato.pdf'
      })
    ).toEqual({
      url: 'https://cdn.example/doc.pdf',
      fileName: 'contrato.pdf'
    });
  });
});
