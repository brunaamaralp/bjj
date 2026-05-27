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
    expect(member.some((i) => i.id === 'mensalidades')).toBe(true);
    expect(member.some((i) => i.id === 'equipe')).toBe(false);

    const owner = buildMobileMoreItems({
      modules: { finance: false, sales: true, inventory: false },
      isOwner: true,
    });
    expect(owner.some((i) => i.id === 'loja')).toBe(true);
    expect(owner.some((i) => i.id === 'integracoes')).toBe(true);
  });

  it('isMobileMoreItemActive highlights pipeline on lead profile', () => {
    const loc = { pathname: '/lead/x', search: '' };
    expect(
      isMobileMoreItemActive({ id: 'pipeline', to: '/pipeline' }, loc)
    ).toBe(true);
  });
});
