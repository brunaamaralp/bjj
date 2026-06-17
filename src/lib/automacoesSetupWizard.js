import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';

export function automacoesScopeBannerDismissStorageKey(academyId) {
  return `navi_automacoes_scope_dismissed_${String(academyId || '').trim()}`;
}

export function readAutomacoesScopeBannerDismissed(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesScopeBannerDismissStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeAutomacoesScopeBannerDismissed(academyId, dismissed = true) {
  if (!academyId) return;
  try {
    if (dismissed) {
      localStorage.setItem(automacoesScopeBannerDismissStorageKey(academyId), '1');
    } else {
      localStorage.removeItem(automacoesScopeBannerDismissStorageKey(academyId));
    }
  } catch {
    void 0;
  }
}

export function clearAutomacoesScopeBannerDismissed(academyId) {
  writeAutomacoesScopeBannerDismissed(academyId, false);
}

export function automacoesModelosAckStorageKey(academyId) {
  return `navi_automacoes_modelos_ack_${String(academyId || '').trim()}`;
}

export function readAutomacoesModelosAck(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesModelosAckStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeAutomacoesModelosAck(academyId, acknowledged = true) {
  if (!academyId) return;
  try {
    if (acknowledged) {
      localStorage.setItem(automacoesModelosAckStorageKey(academyId), '1');
    } else {
      localStorage.removeItem(automacoesModelosAckStorageKey(academyId));
    }
  } catch {
    void 0;
  }
}

/** True quando pelo menos um modelo difere do texto padrão do sistema. */
export function areTemplatesCustomized(templatesMap) {
  const map = templatesMap && typeof templatesMap === 'object' ? templatesMap : {};
  for (const key of Object.keys(DEFAULT_WHATSAPP_TEMPLATES)) {
    const cur = String(map[key] ?? '').trim();
    const def = String(DEFAULT_WHATSAPP_TEMPLATES[key] ?? '').trim();
    if (cur !== def) return true;
  }
  return false;
}

export function isModelosWizardStepDone({ templatesMap, modelosAcknowledged }) {
  return areTemplatesCustomized(templatesMap) || Boolean(modelosAcknowledged);
}
