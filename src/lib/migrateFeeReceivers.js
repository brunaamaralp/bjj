/**
 * Migração read-path: acquirerFees legado → feeReceivers[].
 */
import { defaultAcquirerFees, normalizeAcquirerFees } from './acquirerFees.js';
import { formatBankAccountLabel, usesDefaultAcquirerFees } from './bankAccounts.js';
import {
  captureMethodFeesToAcquirerFees,
  readCaptureMethods,
} from './captureMethods.js';
import {
  legacyAcquirerFeesToFeeTable,
  newFeeReceiverId,
  normalizeFeeReceiver,
  readFeeReceivers,
} from './feeReceivers.js';

function feesHash(fees) {
  return JSON.stringify(legacyAcquirerFeesToFeeTable(fees));
}

export function migrateFinanceConfigToFeeReceivers(financeConfig) {
  const cfg = financeConfig && typeof financeConfig === 'object' ? financeConfig : {};
  if (readFeeReceivers(cfg).length > 0) {
    return normalizeMigratedConfig(cfg);
  }

  const receivers = [];
  const receiverByHash = new Map();

  const ensureReceiver = ({ name, provider, bankAccountLabel, acquirerFees, useDefaultFees }) => {
    if (useDefaultFees) return null;
    const fees = legacyAcquirerFeesToFeeTable(acquirerFees);
    const hash = JSON.stringify(fees);
    if (receiverByHash.has(hash)) {
      return receiverByHash.get(hash);
    }
    const receiver = normalizeFeeReceiver({
      id: newFeeReceiverId(),
      name,
      provider: provider || 'manual',
      bankAccountLabel: bankAccountLabel || '',
      active: true,
      useDefaultFees: false,
      fees,
    });
    receiverByHash.set(hash, receiver);
    receivers.push(receiver);
    return receiver;
  };

  const globalFees = normalizeAcquirerFees(cfg.acquirerFees || defaultAcquirerFees());
  const defaultReceiver = normalizeFeeReceiver({
    id: newFeeReceiverId(),
    name: 'Padrão academia',
    provider: 'manual',
    bankAccountLabel: '',
    active: true,
    useDefaultFees: false,
    fees: legacyAcquirerFeesToFeeTable(globalFees),
  });
  receivers.push(defaultReceiver);
  receiverByHash.set(feesHash(globalFees), defaultReceiver);

  const bankAccounts = Array.isArray(cfg.bankAccounts) ? cfg.bankAccounts : [];
  const migratedBanks = bankAccounts.map((acc) => {
    if (usesDefaultAcquirerFees(acc)) {
      return { ...acc, feeReceiverId: defaultReceiver.id };
    }
    const label = formatBankAccountLabel(acc);
    const receiver =
      ensureReceiver({
        name: label ? `Taxas · ${label}` : 'Taxas da conta',
        provider: 'manual',
        bankAccountLabel: label,
        acquirerFees: acc.acquirerFees || globalFees,
        useDefaultFees: false,
      }) || defaultReceiver;
    return {
      ...acc,
      feeReceiverId: receiver.id,
      useDefaultAcquirerFees: true,
    };
  });

  const captureMethods = readCaptureMethods(cfg);
  const migratedCapture = captureMethods.map((cap) => {
    if (cap.useDefaultFees !== false) {
      const label = cap.bankAccountLabel || '';
      const bank = migratedBanks.find((b) => formatBankAccountLabel(b) === label);
      return {
        ...cap,
        feeReceiverId: bank?.feeReceiverId || defaultReceiver.id,
        useDefaultFees: true,
      };
    }
    const legacyFees = captureMethodFeesToAcquirerFees(cap, cap.fees);
    const receiver =
      ensureReceiver({
        name: cap.name || `Meio · ${cap.id.slice(0, 8)}`,
        provider: cap.integration?.provider || 'manual',
        bankAccountLabel: cap.bankAccountLabel || '',
        acquirerFees: legacyFees,
        useDefaultFees: false,
      }) || defaultReceiver;
    return {
      ...cap,
      feeReceiverId: receiver.id,
      useDefaultFees: true,
    };
  });

  return normalizeMigratedConfig({
    ...cfg,
    feeReceivers: receivers,
    defaultFeeReceiverId: defaultReceiver.id,
    bankAccounts: migratedBanks,
    captureMethods: migratedCapture,
    feeReceiversMigrated: true,
  });
}

function normalizeMigratedConfig(cfg) {
  const receivers = readFeeReceivers(cfg);
  const defaultId =
    String(cfg.defaultFeeReceiverId || '').trim() ||
    receivers.find((r) => r.name === 'Padrão academia')?.id ||
    receivers[0]?.id ||
    '';
  return {
    ...cfg,
    feeReceivers: receivers,
    defaultFeeReceiverId: defaultId,
  };
}
