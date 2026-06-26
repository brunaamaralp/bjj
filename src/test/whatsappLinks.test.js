import { describe, expect, it } from 'vitest';
import {
  buildCollectionWhatsappDraft,
  buildWaMeUrl,
  studentHasValidWaPhone,
} from '../lib/whatsappLinks.js';

describe('whatsappLinks', () => {
  it('buildWaMeUrl normaliza telefone BR', () => {
    expect(buildWaMeUrl('(11) 98765-4321')).toBe('https://wa.me/5511987654321');
  });

  it('buildWaMeUrl inclui texto quando informado', () => {
    const url = buildWaMeUrl('11987654321', 'Olá aluno');
    expect(url).toContain('https://wa.me/5511987654321');
    expect(url).toContain('text=');
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Olá aluno');
  });

  it('buildWaMeUrl rejeita telefone curto', () => {
    expect(buildWaMeUrl('12345')).toBe('');
  });

  it('studentHasValidWaPhone reflete validade', () => {
    expect(studentHasValidWaPhone('11987654321')).toBe(true);
    expect(studentHasValidWaPhone('123')).toBe(false);
  });

  it('buildCollectionWhatsappDraft substitui [nome]', () => {
    expect(
      buildCollectionWhatsappDraft({
        stage: { defaultMessage: 'Olá [nome], mensalidade em aberto.' },
        studentName: 'Maria',
      })
    ).toBe('Olá Maria, mensalidade em aberto.');
  });
});
