import { isUsableBankAccount, normalizeBankAccountEntry } from './bankAccounts.js';
import {
  FINANCE_SETTINGS_SECTIONS,
  financeSettingsSectionLabel,
} from './financeSettingsSections.js';

function normalizeVendorNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Valida planos e contas antes de persistir financeConfig na academia.
 * @returns {{ ok: boolean, issues: Array<{ sectionId: string, message: string }> }}
 */
export function validateFinanceConfigBeforeSave({ financeConfig, isOwner = true } = {}) {
  const issues = [];
  const cfg = financeConfig && typeof financeConfig === 'object' ? financeConfig : {};

  if (isOwner) {
    const plans = Array.isArray(cfg.plans) ? cfg.plans : [];
    plans.forEach((pl, idx) => {
      const name = String(pl?.name || '').trim();
      if (!name) {
        issues.push({
          sectionId: FINANCE_SETTINGS_SECTIONS.PLANOS,
          message: `Plano ${idx + 1}: informe o nome.`,
        });
      }
    });

    const vendors = Array.isArray(cfg.vendors) ? cfg.vendors : [];
    const seenVendorNames = new Set();
    vendors.forEach((vendor, idx) => {
      const name = String(vendor?.name || '').trim();
      if (!name) {
        issues.push({
          sectionId: FINANCE_SETTINGS_SECTIONS.FORNECEDORES,
          message: `Fornecedor ${idx + 1}: informe o nome.`,
        });
        return;
      }
      const key = normalizeVendorNameKey(name);
      if (seenVendorNames.has(key)) {
        issues.push({
          sectionId: FINANCE_SETTINGS_SECTIONS.FORNECEDORES,
          message: `Fornecedor ${idx + 1}: nome duplicado (“${name}”).`,
        });
        return;
      }
      seenVendorNames.add(key);
    });
  }

  const banks = Array.isArray(cfg.bankAccounts) ? cfg.bankAccounts : [];
  banks.forEach((acc, idx) => {
    if (!isUsableBankAccount(normalizeBankAccountEntry(acc))) {
      issues.push({
        sectionId: FINANCE_SETTINGS_SECTIONS.RECEBIMENTO,
        message: `Conta ${idx + 1}: informe banco, número da conta ou chave PIX.`,
      });
    }
  });

  return { ok: issues.length === 0, issues };
}

/** Mensagem única para toast / sticky save (agrupa por seção). */
export function formatFinanceConfigSaveError(issues) {
  const list = Array.isArray(issues) ? issues : [];
  if (!list.length) return '';

  const bySection = new Map();
  for (const issue of list) {
    const sid = String(issue?.sectionId || '').trim();
    if (!sid) continue;
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid).push(String(issue.message || '').trim());
  }

  const parts = [];
  for (const [sectionId, messages] of bySection) {
    const label = financeSettingsSectionLabel(sectionId);
    const first = messages.find(Boolean) || 'Revise os campos obrigatórios.';
    parts.push(`${label}: ${first}`);
  }

  if (parts.length === 0) return 'Revise as configurações antes de salvar.';
  if (parts.length === 1) return `Corrija antes de salvar — ${parts[0]}`;
  const head = parts.slice(0, 2).join(' · ');
  const extra = parts.length > 2 ? ` (+${parts.length - 2} seção${parts.length - 2 === 1 ? '' : 'ões'})` : '';
  return `Corrija antes de salvar — ${head}${extra}`;
}

/** Primeira seção com problema (para navegação opcional). */
export function firstFinanceConfigIssueSection(issues) {
  const list = Array.isArray(issues) ? issues : [];
  return String(list[0]?.sectionId || '').trim() || null;
}
