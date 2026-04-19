/**
 * Wizard do assistente gravado dentro de `modules` (JSON) quando o Appwrite
 * não tem atributo dedicado `wizard_data` na academia nem no doc de settings.
 */
export const NAVI_WIZARD_MODULES_KEY = '_naviWizardData';

/**
 * Preserva o JSON do wizard ao salvar só sales/inventory/finance pela UI do estúdio.
 * @param {Record<string, unknown>} uiModules — tipicamente { sales, inventory, finance }
 * @param {string | Record<string, unknown> | null | undefined} currentModulesDocValue — doc.modules do Appwrite
 */
export function mergeNaviWizardIntoModulesPayload(uiModules, currentModulesDocValue) {
  const base = uiModules && typeof uiModules === 'object' && !Array.isArray(uiModules) ? { ...uiModules } : {};
  try {
    const raw =
      currentModulesDocValue == null || currentModulesDocValue === ''
        ? {}
        : typeof currentModulesDocValue === 'string'
          ? JSON.parse(currentModulesDocValue)
          : currentModulesDocValue;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const w = raw[NAVI_WIZARD_MODULES_KEY];
      if (typeof w === 'string' && w.trim()) {
        base[NAVI_WIZARD_MODULES_KEY] = w;
      }
    }
  } catch {
    void 0;
  }
  return base;
}
