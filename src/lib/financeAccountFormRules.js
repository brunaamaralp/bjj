/**
 * Validação e sugestões do drawer de plano de contas.
 */

import { isProtectedAccountCode, PROTECTED_CODES } from './protectedAccountCodes.js';
import { isKnownDreGroup } from './financeCategories.js';

const RESULT_ACCOUNT_TYPES = new Set(['receita', 'custo', 'despesa']);

export function isProtectedCodeForCreate(code) {
  return PROTECTED_CODES.has(String(code || '').trim());
}

export function isDuplicateCode(code, accounts, excludeId = null) {
  const target = String(code || '').trim();
  if (!target) return false;
  const list = Array.isArray(accounts) ? accounts : [];
  return list.some(
    (a) => String(a.code || '').trim() === target && String(a.id || '') !== String(excludeId || '')
  );
}

export function accountHasChildAccounts(parentCode, accounts) {
  const base = String(parentCode || '').trim();
  if (!base) return false;
  const prefix = base.endsWith('.') ? base : `${base}.`;
  return (Array.isArray(accounts) ? accounts : []).some((a) => {
    const c = String(a.code || '').trim();
    return c.startsWith(prefix) && c !== base;
  });
}

export function suggestFieldsForType(type) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'receita') return { nature: 'credora', dreGrupo: 'Receita Bruta' };
  if (t === 'custo') return { nature: 'devedora', dreGrupo: 'CMV/CPV' };
  if (t === 'despesa') return { nature: 'devedora', dreGrupo: 'Despesas Operacionais' };
  if (t === 'passivo' || t === 'pl') return { nature: 'credora', dreGrupo: '' };
  return { nature: 'devedora', dreGrupo: '' };
}

export function inheritFromParentAccount(parent) {
  if (!parent) return {};
  return {
    type: parent.type || 'ativo',
    nature: parent.nature || 'devedora',
    dreGrupo: String(parent.dreGrupo || '').trim(),
    dfcClasse: String(parent.dfcClasse || '').trim(),
    dfcSubclasse: String(parent.dfcSubclasse || '').trim(),
    cash: Boolean(parent.cash),
  };
}

export function requiresDreGroup(type) {
  return RESULT_ACCOUNT_TYPES.has(String(type || '').trim().toLowerCase());
}

/**
 * @returns {{ errors: Record<string, string> }}
 */
export function validateAccountForm(form, accounts, { mode = 'create', excludeId = null } = {}) {
  const errors = {};
  const code = String(form?.code || '').trim();
  const name = String(form?.name || '').trim();
  const type = String(form?.type || '').trim().toLowerCase();
  const dreGrupo = String(form?.dreGrupo || '').trim();

  if (!code) errors.code = 'Informe o código da conta.';
  if (!name) errors.name = 'Informe o nome da conta.';

  if (code) {
    if (mode === 'create' && isProtectedCodeForCreate(code)) {
      errors.code = 'Este código é reservado pelo sistema.';
    }
    if (isDuplicateCode(code, accounts, excludeId)) {
      errors.code = 'Já existe uma conta com este código.';
    }
  }

  if (requiresDreGroup(type)) {
    if (!dreGrupo) {
      errors.dreGrupo = 'Selecione o grupo DRE.';
    } else if (!isKnownDreGroup(dreGrupo)) {
      errors.dreGrupo = 'Grupo DRE inválido.';
    }
  }

  return { errors };
}

export function formatDeleteAccountDescription(account, { usageCount = 0, hasChildren = false } = {}) {
  const parts = ['Esta conta será removida do plano de contas. A operação não pode ser desfeita.'];
  if (usageCount > 0) {
    parts.push(`Há ${usageCount} lançamento(s) vinculado(s) no razão.`);
  }
  if (hasChildren) {
    parts.push('Existem subcontas — remova ou reatribua antes de excluir.');
  }
  return parts.join(' ');
}
