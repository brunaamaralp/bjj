import { describe, it, expect } from 'vitest';
import {
  inboxOtherMediaPlaceholderKind,
  isOutboundImagePlaceholder,
  inboxMediaCaption
} from '../lib/inboxMediaUtils.js';

describe('inboxMediaUtils', () => {
  it('detecta placeholder de imagem outbound', () => {
    expect(isOutboundImagePlaceholder('[Imagem enviada pelo celular]')).toBe(true);
  });

  it('classifica vídeo por conteúdo', () => {
    expect(inboxOtherMediaPlaceholderKind({}, '🎥 [Vídeo recebido]')).toBe('video');
  });

  it('omite legendas de placeholder', () => {
    expect(inboxMediaCaption('[imagem]')).toBe('');
    expect(inboxMediaCaption('Olá, veja a foto')).toBe('Olá, veja a foto');
  });
});
