import { FINANCEIRO_SECTIONS } from './financeiroHubTabs.js';

export const PAYABLES_SECTIONS = {
  VISAO: 'visao',
  CONTAS_FIXAS: 'contas-fixas',
  VENCIDAS: 'vencidas',
};

const VALID = new Set(Object.values(PAYABLES_SECTIONS));

export const PAYABLES_SECTION_LABELS = {
  [PAYABLES_SECTIONS.VISAO]: 'Visão geral',
  [PAYABLES_SECTIONS.CONTAS_FIXAS]: 'Contas fixas',
  [PAYABLES_SECTIONS.VENCIDAS]: 'Vencidas',
};

export function parsePayablesSection(searchParams) {
  const raw = String(searchParams?.get?.('section') || '').trim().toLowerCase();
  return VALID.has(raw) ? raw : PAYABLES_SECTIONS.VISAO;
}

export function getDefaultPayablesSection() {
  return PAYABLES_SECTIONS.CONTAS_FIXAS;
}

export function buildPayablesSearchParams({
  section = PAYABLES_SECTIONS.VISAO,
  tx,
  new: isNew,
  search,
} = {}) {
  const p = new URLSearchParams();
  p.set('tab', FINANCEIRO_SECTIONS.A_PAGAR);
  if (section && section !== PAYABLES_SECTIONS.VISAO) {
    p.set('section', section);
  }
  if (tx) p.set('tx', String(tx));
  if (isNew) p.set('new', '1');
  if (search) p.set('search', String(search));
  return p;
}

export function buildPayablesPath(opts = {}) {
  const p = buildPayablesSearchParams(opts);
  const qs = p.toString();
  return qs ? `/financeiro?${qs}` : '/financeiro';
}
