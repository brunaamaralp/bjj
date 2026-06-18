import { describe, it, expect } from 'vitest';
import {
  isLeadChildProfile,
  leadCardPrimaryName,
  leadCardGuardianSubtitle,
  leadCardTooltip,
  leadMatchesKanbanSearch,
  leadProfileNameFieldLabel,
  leadProfileNeedsGuardianHint,
} from '../lib/leadDisplayName.js';

describe('leadDisplayName', () => {
  const childLead = {
    name: 'Antônio',
    parentName: 'Letícia',
    type: 'Criança',
    phone: '5511999998888',
  };

  it('isLeadChildProfile só por type Criança/Juniores', () => {
    expect(isLeadChildProfile({ type: 'Criança' })).toBe(true);
    expect(isLeadChildProfile({ type: 'Juniores' })).toBe(true);
    expect(isLeadChildProfile({ type: 'Adulto', parentName: 'Maria' })).toBe(false);
    expect(isLeadChildProfile({ type: 'Adulto' })).toBe(false);
  });

  it('subtítulo mostra responsável quando difere do aluno', () => {
    expect(leadCardGuardianSubtitle(childLead)).toBe('resp. Letícia');
  });

  it('subtítulo vazio sem parentName ou nomes iguais', () => {
    expect(leadCardGuardianSubtitle({ ...childLead, parentName: '' })).toBe('');
    expect(leadCardGuardianSubtitle({ ...childLead, parentName: 'Antônio' })).toBe('');
    expect(leadCardGuardianSubtitle({ name: 'João', type: 'Adulto', parentName: 'Maria' })).toBe('');
  });

  it('tooltip concatena aluno e responsável', () => {
    expect(leadCardTooltip(childLead)).toBe('Antônio · Letícia');
    expect(leadCardTooltip({ name: 'João', type: 'Adulto' })).toBe('João');
  });

  it('busca encontra por nome do responsável', () => {
    expect(leadMatchesKanbanSearch(childLead, 'letícia')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, 'antonio')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, '99998888')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, 'xyz')).toBe(false);
  });

  it('busca ignora acentos', () => {
    expect(leadMatchesKanbanSearch(childLead, 'leticia')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, 'Antonio')).toBe(true);
  });

  it('labels e hint de perfil', () => {
    expect(leadProfileNameFieldLabel(childLead)).toBe('Nome do aluno');
    expect(leadProfileNameFieldLabel({ type: 'Adulto' })).toBe('Nome');
    expect(leadProfileNeedsGuardianHint(childLead)).toBe(false);
    expect(leadProfileNeedsGuardianHint({ name: 'Bia', type: 'Criança', parentName: '' })).toBe(true);
  });

  it('primaryName fallback Sem nome', () => {
    expect(leadCardPrimaryName({})).toBe('Sem nome');
    expect(leadCardPrimaryName(childLead)).toBe('Antônio');
  });
});
