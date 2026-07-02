/** Defaults de módulos da academia — vendas sempre ativas. */
export const DEFAULT_ACADEMY_MODULES = Object.freeze({
  sales: true,
  inventory: false,
  finance: false,
  aiEnabled: true,
});

/**
 * Normaliza flags de módulo a partir do JSON `academies.modules`.
 * Vendas ficam sempre habilitadas; demais módulos só com `true` explícito.
 * @param {unknown} raw
 */
export function normalizeAcademyModules(raw) {
  const mods = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const aiEnabled =
    typeof mods.aiEnabled === 'boolean' ? mods.aiEnabled : mods.ai?.enabled !== false;
  return {
    sales: true,
    inventory: mods.inventory === true,
    finance: mods.finance === true,
    aiEnabled,
  };
}

/**
 * Payload `modules` para persistência no Appwrite (preserva sales ativo).
 * @param {Record<string, unknown>} uiModules
 */
export function academyModulesForSave(uiModules = {}) {
  const base = uiModules && typeof uiModules === 'object' && !Array.isArray(uiModules) ? { ...uiModules } : {};
  return { ...base, sales: true };
}
