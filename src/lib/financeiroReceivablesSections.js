import { FINANCEIRO_SECTIONS } from './financeiroHubTabs.js';
import { RECEIVABLE_SOURCE } from './receivablesAggregate.js';

export const RECEIVABLES_SECTIONS = {
  VISAO: 'visao',
  MENSALIDADES: 'mensalidades',
  OUTROS: 'outros',
};

const VALID = new Set(Object.values(RECEIVABLES_SECTIONS));

export const RECEIVABLES_SECTION_LABELS = {
  [RECEIVABLES_SECTIONS.VISAO]: 'Visão geral',
  [RECEIVABLES_SECTIONS.MENSALIDADES]: 'Mensalidades',
  [RECEIVABLES_SECTIONS.OUTROS]: 'Outros',
};

export function filterReceivablesForSection(section, items = []) {
  if (section === RECEIVABLES_SECTIONS.MENSALIDADES) {
    return items.filter((it) => it.source === RECEIVABLE_SOURCE.MENSALIDADE);
  }
  if (section === RECEIVABLES_SECTIONS.OUTROS) {
    return items.filter(
      (it) =>
        it.source === RECEIVABLE_SOURCE.LANCAMENTO || it.source === RECEIVABLE_SOURCE.VENDA
    );
  }
  return items;
}

export function parseReceivablesSection(searchParams) {
  const raw = String(searchParams?.get?.('section') || '').trim().toLowerCase();
  return VALID.has(raw) ? raw : RECEIVABLES_SECTIONS.VISAO;
}

export function getDefaultReceivablesSection(navRoleOrAccess) {
  if (navRoleOrAccess && typeof navRoleOrAccess === 'object') {
    const { isOwner, isAdmin } = navRoleOrAccess;
    if (isOwner || isAdmin) return RECEIVABLES_SECTIONS.VISAO;
    return RECEIVABLES_SECTIONS.MENSALIDADES;
  }
  return navRoleOrAccess === 'member'
    ? RECEIVABLES_SECTIONS.MENSALIDADES
    : RECEIVABLES_SECTIONS.VISAO;
}

export function buildReceivablesSearchParams({
  section = RECEIVABLES_SECTIONS.VISAO,
  search,
  filtro,
  extra = {},
} = {}) {
  const p = new URLSearchParams();
  p.set('tab', FINANCEIRO_SECTIONS.A_RECEBER);
  if (section && section !== RECEIVABLES_SECTIONS.VISAO) {
    p.set('section', section);
  }
  if (search) p.set('search', search);
  if (filtro) p.set('filtro', filtro);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && String(v).trim()) p.set(k, String(v));
  }
  return p;
}

export function buildReceivablesPath(opts = {}) {
  const p = buildReceivablesSearchParams(opts);
  const qs = p.toString();
  return qs ? `/financeiro?${qs}` : '/financeiro';
}

export function normalizeLegacyFinanceiroTab(searchParams) {
  const tab = String(searchParams?.get?.('tab') || '').trim().toLowerCase();
  const section = parseReceivablesSection(searchParams);
  const search = searchParams?.get?.('search') || undefined;
  const filtro = searchParams?.get?.('filtro') || searchParams?.get?.('filter') || undefined;

  if (tab === 'mensalidades') {
    return {
      tab: FINANCEIRO_SECTIONS.A_RECEBER,
      section: RECEIVABLES_SECTIONS.MENSALIDADES,
      search,
      filtro,
      changed: true,
    };
  }

  return { tab, section, search, filtro, changed: false };
}
