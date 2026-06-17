import { describe, it, expect } from 'vitest';
import { NAV_MENU_ICONS, getNavMenuIcon } from '../lib/naviMenuIcons.js';

describe('naviMenuIcons', () => {
  it('resolves finance hub keys used in mobile more sheet', () => {
    const keys = [
      'novoLancamento',
      'visaoGeralFinanceiro',
      'aReceber',
      'aPagar',
      'movimentacoes',
    ];
    keys.forEach((key) => {
      expect(NAV_MENU_ICONS[key]).toBeDefined();
    });
    const icons = keys.map((key) => getNavMenuIcon(key));
    expect(new Set(icons).size).toBe(keys.length);
  });

  it('resolves mobile more sheet footer keys', () => {
    expect(getNavMenuIcon('empresa')).toBe(NAV_MENU_ICONS.empresa);
    expect(getNavMenuIcon('equipe')).toBe(NAV_MENU_ICONS.equipe);
    expect(getNavMenuIcon('integracoes')).toBe(NAV_MENU_ICONS.integracoes);
  });
});
