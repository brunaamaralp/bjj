import { describe, it, expect } from 'vitest';
import {
  slugifyGuideTitle,
  normalizeGuideSlug,
  filterPublishedGuides,
  validateGuideTitle,
} from './portalGuidesCore.js';

describe('portalGuidesCore', () => {
  it('slugifyGuideTitle normaliza acentos', () => {
    expect(slugifyGuideTitle('Primeira Aula — Regras')).toBe('primeira-aula-regras');
  });

  it('normalizeGuideSlug rejeita inválidos', () => {
    expect(normalizeGuideSlug('ok-slug')).toBe('ok-slug');
    expect(normalizeGuideSlug('Bad Slug!')).toBe('');
  });

  it('filterPublishedGuides mantém só publicados', () => {
    const docs = [
      { $id: '1', published: true },
      { $id: '2', published: false },
      { $id: '3', published: true },
    ];
    expect(filterPublishedGuides(docs).map((d) => d.$id)).toEqual(['1', '3']);
  });

  it('validateGuideTitle exige título', () => {
    expect(validateGuideTitle('')).toEqual({ ok: false, erro: 'title_required' });
    expect(validateGuideTitle('Guia')).toEqual({ ok: true });
  });
});
