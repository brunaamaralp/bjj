import { describe, it, expect } from 'vitest';
import {
  resolveRecepcaoHubTab,
  buildRecepcaoHubTabItems,
  buildRecepcaoLegacyRedirectPath,
  isRecepcaoCatracaHistoricoSection,
  RECEPCAO_TAB_CATRACA,
  RECEPCAO_TAB_EXPERIMENTAIS,
} from '../lib/recepcaoHubTabs.js';

describe('recepcaoHubTabs', () => {
  it('resolveRecepcaoHubTab — default experimentais', () => {
    expect(resolveRecepcaoHubTab('')).toBe(RECEPCAO_TAB_EXPERIMENTAIS);
    expect(resolveRecepcaoHubTab(null)).toBe(RECEPCAO_TAB_EXPERIMENTAIS);
  });

  it('resolveRecepcaoHubTab — catraca e aliases', () => {
    expect(resolveRecepcaoHubTab('catraca')).toBe(RECEPCAO_TAB_CATRACA);
    expect(resolveRecepcaoHubTab('porta')).toBe(RECEPCAO_TAB_CATRACA);
    expect(resolveRecepcaoHubTab('retornos')).toBe(RECEPCAO_TAB_EXPERIMENTAIS);
  });

  it('buildRecepcaoHubTabItems — badge em experimentais', () => {
    const items = buildRecepcaoHubTabItems({ followUpCount: 3 });
    const exp = items.find((i) => i.id === RECEPCAO_TAB_EXPERIMENTAIS);
    expect(exp?.badgeCount).toBe(3);
    expect(items.find((i) => i.id === RECEPCAO_TAB_CATRACA)?.badgeCount).toBeUndefined();
  });

  it('buildRecepcaoLegacyRedirectPath', () => {
    expect(buildRecepcaoLegacyRedirectPath()).toBe('/?tab=catraca');
    expect(buildRecepcaoLegacyRedirectPath({ historico: true })).toBe(
      '/?tab=catraca&section=historico'
    );
  });

  it('isRecepcaoCatracaHistoricoSection', () => {
    expect(isRecepcaoCatracaHistoricoSection('historico')).toBe(true);
    expect(isRecepcaoCatracaHistoricoSection('ao-vivo')).toBe(false);
  });
});
