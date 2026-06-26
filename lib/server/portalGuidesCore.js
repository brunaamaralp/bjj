/**
 * Helpers para guias de orientação do portal.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GUIDE_CATEGORIES = ['geral', 'regras', 'primeira_aula', 'faq'];

export const GUIDE_CATEGORY_LABELS = {
  geral: 'Geral',
  regras: 'Regras',
  primeira_aula: 'Primeira aula',
  faq: 'Perguntas frequentes',
};

export function slugifyGuideTitle(title) {
  const base = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || 'guia';
}

export function normalizeGuideSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
    .slice(0, 128);
  if (!s || !SLUG_RE.test(s)) return '';
  return s;
}

export function validateGuideBody(body) {
  const text = String(body || '');
  if (!text.trim()) return { ok: false, erro: 'body_required' };
  if (text.length > 24576) return { ok: false, erro: 'body_too_long' };
  return { ok: true };
}

export function validateGuideTitle(title) {
  const t = String(title || '').trim();
  if (!t) return { ok: false, erro: 'title_required' };
  if (t.length > 256) return { ok: false, erro: 'title_too_long' };
  return { ok: true };
}

export function filterPublishedGuides(docs) {
  return (docs || []).filter((d) => d.published === true);
}
