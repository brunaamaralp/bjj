import { create } from 'zustand';

const LS_BASE_KEY = 'bjj_accounting_v1';

function getLsKey(academyId) {
  if (!academyId) return null;
  return `${LS_BASE_KEY}_${academyId}`;
}

function loadState(academyId) {
  try {
    const key = getLsKey(academyId);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('[AccountingStore] Erro no LocalStorage:', e); }
  return null;
}

function saveState(academyId, state) {
  try {
    const key = getLsKey(academyId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) { console.error('[AccountingStore] Erro no LocalStorage:', e); }
}

export function seedAccounts() {
  const rows = [
    { id: crypto.randomUUID(), code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: 'Caixa', dfcSubclasse: '', cash: true, parentCode: '1.1' },
    { id: crypto.randomUUID(), code: '1.1.2', name: 'Clientes', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: 'Operacional', dfcSubclasse: 'clientes', cash: false, parentCode: '1.1' },
    { id: crypto.randomUUID(), code: '1.2.1', name: 'Imobilizado', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: 'Investimento', dfcSubclasse: 'capex', cash: false, parentCode: '1.2' },
    { id: crypto.randomUUID(), code: '2.1.1', name: 'Fornecedores', type: 'passivo', nature: 'credora', dreGrupo: '', dfcClasse: 'Operacional', dfcSubclasse: 'fornecedores', cash: false, parentCode: '2.1' },
    { id: crypto.randomUUID(), code: '2.2.1', name: 'Empréstimos', type: 'passivo', nature: 'credora', dreGrupo: '', dfcClasse: 'Financiamento', dfcSubclasse: 'empréstimos', cash: false, parentCode: '2.2' },
    { id: crypto.randomUUID(), code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora', dreGrupo: 'Receita Bruta', dfcClasse: 'Operacional', dfcSubclasse: 'clientes', cash: false, parentCode: '4.1' },
    { id: crypto.randomUUID(), code: '4.9.1', name: 'Deduções/Impostos s/ Vendas', type: 'receita', nature: 'devedora', dreGrupo: 'Deduções', dfcClasse: 'Operacional', dfcSubclasse: '', cash: false, parentCode: '4.9' },
    { id: crypto.randomUUID(), code: '5.1.1', name: 'CMV/CPV', type: 'custo', nature: 'devedora', dreGrupo: 'CMV/CPV', dfcClasse: 'Operacional', dfcSubclasse: 'fornecedores', cash: false, parentCode: '5.1' },
    { id: crypto.randomUUID(), code: '6.2.1', name: 'Despesas Gerais e Adm', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais', dfcClasse: 'Operacional', dfcSubclasse: 'folha', cash: false, parentCode: '6.2' },
    { id: crypto.randomUUID(), code: '7.1.1', name: 'Despesas Financeiras', type: 'despesa', nature: 'devedora', dreGrupo: 'Resultado Financeiro', dfcClasse: 'Financiamento', dfcSubclasse: 'juros', cash: true, parentCode: '7.1' },
  ];
  return rows;
}

function calcSign(nature, debit, credit) {
  const val = Number(debit || 0) - Number(credit || 0);
  if (nature === 'credora') return -val;
  return val;
}

function endOfDay(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt.toISOString();
}

export const useAccountingStore = create((set, get) => ({
    accounts: seedAccounts(),
    journal: [],
    academyId: null,

    loadByAcademy: (id) => {
      if (!id) return;
      const loaded = loadState(id);
      set({
        academyId: id,
        accounts: loaded?.accounts || seedAccounts(),
        journal: loaded?.journal || []
      });
    },

    setAccounts: (list) =>
      set((state) => {
        const next = { ...state, accounts: Array.isArray(list) ? list : [] };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),
    setJournal: (list) =>
      set((state) => {
        const next = { ...state, journal: Array.isArray(list) ? list : [] };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    addAccount: (acc) =>
      set((state) => {
        const next = { ...state, accounts: [...state.accounts, { id: crypto.randomUUID(), ...acc }] };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    updateAccount: (id, updates) =>
      set((state) => {
        const idx = state.accounts.findIndex((a) => a.id === id);
        if (idx < 0) return {};
        const nextAccounts = state.accounts.slice();
        nextAccounts[idx] = { ...nextAccounts[idx], ...updates };
        const next = { ...state, accounts: nextAccounts };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    deleteAccount: (id) =>
      set((state) => {
        const acc = state.accounts.find((a) => a.id === id);
        if (!acc) return {};
        const hasChildren = state.accounts.some((a) => a.code.startsWith(acc.code + '.'));
        if (hasChildren) return {};
        const next = { ...state, accounts: state.accounts.filter((a) => a.id !== id) };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    addEntry: (entry) =>
      set((state) => {
        const lines = entry.lines || [];
        const sumD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const sumC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Number(sumD.toFixed(2)) !== Number(sumC.toFixed(2))) return {};
        const doc = {
          id: crypto.randomUUID(),
          date: entry.date,
          memo: entry.memo || '',
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            cash: Boolean(l.cash),
            counterCode: l.counterCode || '',
          })),
        };
        const next = { ...state, journal: [doc, ...state.journal] };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    deleteEntry: (id) =>
      set((state) => {
        const next = { ...state, journal: state.journal.filter((e) => e.id !== id) };
        if (state.academyId) saveState(state.academyId, { accounts: next.accounts, journal: next.journal });
        return next;
      }),

    trialBalance: (from, to) => {
      const { accounts, journal } = get();
      const toIso = to ? endOfDay(to) : null;
      const map = new Map();
      accounts.forEach((a) => {
        map.set(a.id, { account: a, balance: 0, debit: 0, credit: 0 });
      });
      journal.forEach((e) => {
        if (from && new Date(e.date) < new Date(from)) return;
        if (toIso && new Date(e.date) > new Date(toIso)) return;
        e.lines.forEach((l) => {
          const acc = accounts.find((a) => a.id === l.accountId);
          if (!acc) return;
          const obj = map.get(acc.id);
          obj.debit += Number(l.debit || 0);
          obj.credit += Number(l.credit || 0);
          obj.balance += calcSign(acc.nature, l.debit, l.credit);
        });
      });
      return Array.from(map.values()).filter((v) => v.debit !== 0 || v.credit !== 0);
    },

    dre: (from, to) => {
      const tb = get().trialBalance(from, to);
      const groups = {
        'Receita Bruta': 0,
        'Deduções': 0,
        'Receita Líquida': 0,
        'CMV/CPV': 0,
        'Lucro Bruto': 0,
        'Despesas Operacionais': 0,
        'Resultado Operacional': 0,
        'Resultado Financeiro': 0,
        'Antes IR/CS': 0,
        'Imposto s/ Lucro': 0,
        'Resultado Líquido': 0,
      };
      tb.forEach((r) => {
        const g = r.account.dreGrupo || '';
        const val =
          r.account.type === 'receita'
            ? -(r.account.nature === 'credora' ? -r.balance : r.balance)
            : r.balance;
        if (!g) return;
        groups[g] = (groups[g] || 0) + val;
      });
      groups['Receita Líquida'] = (groups['Receita Bruta'] || 0) - Math.abs(groups['Deduções'] || 0);
      groups['Lucro Bruto'] = (groups['Receita Líquida'] || 0) - Math.abs(groups['CMV/CPV'] || 0);
      groups['Resultado Operacional'] = (groups['Lucro Bruto'] || 0) - Math.abs(groups['Despesas Operacionais'] || 0);
      groups['Antes IR/CS'] = (groups['Resultado Operacional'] || 0) + (groups['Resultado Financeiro'] || 0);
      groups['Resultado Líquido'] = (groups['Antes IR/CS'] || 0) - Math.abs(groups['Imposto s/ Lucro'] || 0);
      return groups;
    },

    dfcIndireto: (from, to) => {
      const tb = get().trialBalance(from, to);
      const op = { operacional: 0, capitalGiro: 0 };
      const inv = 0;
      const fin = 0;
      tb.forEach((r) => {
        if (['Despesas Operacionais', 'CMV/CPV', 'Receita Bruta', 'Deduções', 'Resultado Financeiro'].includes(r.account.dreGrupo)) {
          op.operacional += r.balance;
        }
        if (r.account.type === 'ativo' && ['1.1.2'].some((p) => r.account.code.startsWith(p))) {
          op.capitalGiro -= r.balance;
        }
        if (r.account.type === 'passivo' && ['2.1.1'].some((p) => r.account.code.startsWith(p))) {
          op.capitalGiro += r.balance;
        }
      });
      return { operacional: op.operacional + op.capitalGiro, investimento: inv, financiamento: fin };
    },

    dfcDireto: (from, to) => {
      const { accounts, journal } = get();
      const toIso = to ? endOfDay(to) : null;
      const tot = { operacional: 0, investimento: 0, financiamento: 0 };
      const isInRange = (d) => {
        if (from && new Date(d) < new Date(from)) return false;
        if (toIso && new Date(d) > new Date(toIso)) return false;
        return true;
      };
      journal.forEach((e) => {
        if (!isInRange(e.date)) return;
        e.lines.forEach((l) => {
          if (!l.cash) return;
          const acc = accounts.find((a) => a.id === l.accountId);
          const counter = accounts.find((a) => l.counterCode && a.code.startsWith(l.counterCode));
          const cls = counter?.dfcClasse || acc?.dfcClasse || 'Operacional';
          const val = Number(l.debit || 0) - Number(l.credit || 0);
          if (cls === 'Operacional') tot.operacional += val;
          else if (cls === 'Investimento') tot.investimento += val;
          else if (cls === 'Financiamento') tot.financiamento += val;
        });
      });
      return tot;
    },
}));


if (typeof window !== 'undefined') {
  window.useAccountingStore = useAccountingStore;
}
