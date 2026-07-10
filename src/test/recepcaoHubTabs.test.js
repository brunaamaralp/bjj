import { describe, it, expect } from 'vitest';
import {
  resolveRecepcaoHubTab,
  buildRecepcaoHubTabItems,
  buildRecepcaoLegacyRedirectPath,
  buildRecepcaoRetencaoPath,
  isRecepcaoCatracaHistoricoSection,
  isRecepcaoCatracaRetencaoSection,
  resolveRecepcaoCatracaSection,
  RECEPCAO_CATRACA_SECTION_LIVE,
  RECEPCAO_CATRACA_SECTION_RETENCAO,
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

  it('buildRecepcaoHubTabItems — badges comercial e presença', () => {
    const items = buildRecepcaoHubTabItems({ followUpCount: 3, atRiskCount: 2 });
    const commercial = items.find((i) => i.id === RECEPCAO_TAB_EXPERIMENTAIS);
    const presence = items.find((i) => i.id === RECEPCAO_TAB_CATRACA);
    expect(commercial?.label).toBe('Comercial');
    expect(presence?.label).toBe('Presença');
    expect(commercial?.badgeCount).toBe(3);
    expect(presence?.badgeCount).toBe(2);
  });

  it('buildRecepcaoLegacyRedirectPath', () => {
    expect(buildRecepcaoLegacyRedirectPath()).toBe('/?tab=catraca');
    expect(buildRecepcaoLegacyRedirectPath({ historico: true })).toBe(
      '/?tab=catraca&section=historico'
    );
    expect(buildRecepcaoLegacyRedirectPath({ retencao: true })).toBe(
      '/?tab=catraca&section=retencao'
    );
  });

  it('buildRecepcaoRetencaoPath', () => {
    expect(buildRecepcaoRetencaoPath()).toBe('/?tab=catraca&section=retencao');
  });

  it('resolveRecepcaoCatracaSection', () => {
    expect(resolveRecepcaoCatracaSection('')).toBe(RECEPCAO_CATRACA_SECTION_LIVE);
    expect(resolveRecepcaoCatracaSection('historico')).toBe('historico');
    expect(resolveRecepcaoCatracaSection('retencao')).toBe(RECEPCAO_CATRACA_SECTION_RETENCAO);
  });

  it('isRecepcaoCatracaHistoricoSection', () => {
    expect(isRecepcaoCatracaHistoricoSection('historico')).toBe(true);
    expect(isRecepcaoCatracaHistoricoSection('ao-vivo')).toBe(false);
  });

  it('isRecepcaoCatracaRetencaoSection', () => {
    expect(isRecepcaoCatracaRetencaoSection('retencao')).toBe(true);
    expect(isRecepcaoCatracaRetencaoSection('historico')).toBe(false);
  });
});
