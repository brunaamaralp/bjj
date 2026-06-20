import { describe, it, expect } from 'vitest';
import {
  buildMobileMoreItems,
  isBottomNavMaisActive,
  isBottomNavPrimaryRoute,
  isMobileMoreItemActive,
} from '../lib/mobileMoreNav.js';

describe('mobileMoreNav', () => {
  it('isBottomNavPrimaryRoute covers home, inbox and students', () => {
    expect(isBottomNavPrimaryRoute('/')).toBe(true);
    expect(isBottomNavPrimaryRoute('/inbox')).toBe(true);
    expect(isBottomNavPrimaryRoute('/students')).toBe(true);
    expect(isBottomNavPrimaryRoute('/student/abc')).toBe(true);
    expect(isBottomNavPrimaryRoute('/pipeline')).toBe(false);
  });

  it('isBottomNavMaisActive when not on primary slots', () => {
    expect(isBottomNavMaisActive('/tarefas')).toBe(true);
    expect(isBottomNavMaisActive('/')).toBe(false);
  });

  it('buildMobileMoreItems respects modules and owner', () => {
    const member = buildMobileMoreItems({
      modules: { finance: true, sales: false, inventory: false },
      isOwner: false,
      pipelineLabel: 'Funil',
    });
    expect(member.some((i) => i.id === 'financeiro-novo-lancamento')).toBe(true);
    expect(member.some((i) => i.id === 'financeiro-a-receber')).toBe(true);
    expect(member.some((i) => i.id === 'financeiro')).toBe(false);
    expect(member.some((i) => i.id === 'mensalidades')).toBe(false);
    expect(member.some((i) => i.id === 'equipe')).toBe(false);

    const ownerPendingWa = buildMobileMoreItems({
      modules: { finance: false, sales: true, inventory: false },
      isOwner: true,
      canConfigureAgenteIa: true,
      waSetupDone: false,
    });
    expect(ownerPendingWa.some((i) => i.id === 'conectar-whatsapp')).toBe(true);

    const owner = buildMobileMoreItems({
      modules: { finance: false, sales: true, inventory: false },
      isOwner: true,
      canConfigureAgenteIa: true,
      waSetupDone: true,
    });
    expect(owner.some((i) => i.id === 'loja')).toBe(true);
    expect(owner.some((i) => i.id === 'agente')).toBe(true);
    expect(owner.some((i) => i.id === 'integracoes')).toBe(false);
    expect(owner.find((i) => i.id === 'configuracoes')).toMatchObject({
      label: 'Configurações',
      to: '/configuracoes',
    });

    const admin = buildMobileMoreItems({
      modules: { finance: false, sales: false, inventory: false },
      isOwner: false,
      canConfigureAgenteIa: false,
    });
    expect(admin.some((i) => i.id === 'agente')).toBe(false);
  });

  it('isMobileMoreItemActive highlights agente and automacoes separately', () => {
    expect(
      isMobileMoreItemActive({ id: 'agente', to: '/agente-ia' }, { pathname: '/agente-ia', search: '' })
    ).toBe(true);
    expect(
      isMobileMoreItemActive({ id: 'automacoes', to: '/automacoes?tab=modelos' }, { pathname: '/agente-ia', search: '' })
    ).toBe(false);
  });

  it('isMobileMoreItemActive highlights configurações no novo hub', () => {
    expect(
      isMobileMoreItemActive(
        { id: 'configuracoes', to: '/configuracoes' },
        { pathname: '/configuracoes', search: '?tab=crm' }
      )
    ).toBe(true);
  });

  it('isMobileMoreItemActive highlights pipeline on lead profile', () => {
    const loc = { pathname: '/lead/x', search: '' };
    expect(
      isMobileMoreItemActive({ id: 'pipeline', to: '/pipeline' }, loc)
    ).toBe(true);
  });
});
