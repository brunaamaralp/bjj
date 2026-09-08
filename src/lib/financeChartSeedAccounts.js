/**
 * Contas do plano geradas a partir de categorias fixas com dreAccount próprio
 * + helpers de merge para academias já seedadas.
 */

import { FINANCE_CATEGORIES } from './financeCategories.js';

const AGGREGATE_DRE_ACCOUNTS = new Set([
  '1.1.1',
  '1.1.9',
  '2.2.1',
  '2.2.2',
  '3.1.1',
  '3.1.2',
  '4.1.1',
  '4.9.1',
  '5.1.1',
  '6.2.1',
  '7.1.1',
  '7.1.2',
]);

const ACCOUNT_META_BY_CODE = {
  '4.1.2': {
    name: 'Aulas avulsas / day pass',
    type: 'receita',
    nature: 'credora',
    dreGrupo: 'Receita Bruta',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'clientes',
    cash: false,
    parentCode: '4.1',
  },
  '4.1.3': {
    name: 'Eventos e seminários',
    type: 'receita',
    nature: 'credora',
    dreGrupo: 'Receita Bruta',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'clientes',
    cash: false,
    parentCode: '4.1',
  },
  '4.1.4': {
    name: 'Patrocínios',
    type: 'receita',
    nature: 'credora',
    dreGrupo: 'Receita Bruta',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'clientes',
    cash: false,
    parentCode: '4.1',
  },
  '6.2.3': {
    name: 'Limpeza e higiene',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.4': {
    name: 'Material de treino (faixas, tatame…)',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.5': {
    name: 'Transporte e combustível',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.6': {
    name: 'Seguros',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.7': {
    name: 'Contabilidade e honorários',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.8': {
    name: 'Capacitação de professores',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
  '6.2.9': {
    name: 'Equipamentos e utensílios',
    type: 'despesa',
    nature: 'devedora',
    dreGrupo: 'Despesas Operacionais',
    dfcClasse: 'Operacional',
    dfcSubclasse: 'fornecedores',
    cash: false,
    parentCode: '6.2',
  },
};

/** Contas granulares novas (não agregadas) a incluir no seed do plano. */
export function expandedCategorySeedAccounts() {
  const codes = new Set();
  for (const cat of Object.values(FINANCE_CATEGORIES)) {
    const code = String(cat?.dreAccount || '').trim();
    if (!code || AGGREGATE_DRE_ACCOUNTS.has(code)) continue;
    if (!ACCOUNT_META_BY_CODE[code]) continue;
    codes.add(code);
  }
  return [...codes]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((code) => ({ code, ...ACCOUNT_META_BY_CODE[code] }));
}

/**
 * @param {Array<{ code?: string }>} existing
 * @param {Array<{ code?: string }>} [seeds]
 */
export function missingSeedAccounts(existing, seeds = expandedCategorySeedAccounts()) {
  const have = new Set(
    (Array.isArray(existing) ? existing : [])
      .map((a) => String(a?.code || '').trim())
      .filter(Boolean)
  );
  return (Array.isArray(seeds) ? seeds : []).filter((s) => {
    const code = String(s?.code || '').trim();
    return code && !have.has(code);
  });
}
