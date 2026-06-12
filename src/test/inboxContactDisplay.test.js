import { describe, it, expect } from 'vitest';
import {
  buildInboxDisplayNameArgs,
  inboxStudentSubtitle,
  isChildLeadDisplayContext,
  pickInboxContactNameForEdit,
  pickInboxDisplayName,
} from '../lib/inboxContactDisplay.js';

describe('inboxContactDisplay', () => {
  it('isChildLeadDisplayContext detecta criança/júnior e parentName', () => {
    expect(isChildLeadDisplayContext({ parentName: 'Maria' })).toBe(true);
    expect(isChildLeadDisplayContext({ leadType: 'Criança' })).toBe(true);
    expect(isChildLeadDisplayContext({ leadType: 'Juniores' })).toBe(true);
    expect(isChildLeadDisplayContext({ leadType: 'Adulto' })).toBe(false);
  });

  it('adulto prioriza nome do lead', () => {
    expect(
      pickInboxDisplayName({
        leadName: 'Carlos',
        manualContactName: 'Carlos WA',
        whatsappProfileName: 'Perfil',
        leadType: 'Adulto',
      })
    ).toBe('Carlos');
  });

  it('criança prioriza contato WhatsApp sobre nome do aluno', () => {
    expect(
      pickInboxDisplayName({
        leadName: 'Pedro',
        manualContactName: 'Ana Silva',
        leadType: 'Criança',
        parentName: 'Ana Silva',
      })
    ).toBe('Ana Silva');
  });

  it('criança sem contact_name usa parentName e depois aluno', () => {
    expect(
      pickInboxDisplayName({
        leadName: 'Pedro',
        parentName: 'Ana Silva',
        leadType: 'Criança',
      })
    ).toBe('Ana Silva');

    expect(
      pickInboxDisplayName({
        leadName: 'Pedro',
        whatsappProfileName: 'Ana',
        leadType: 'Criança',
      })
    ).toBe('Ana');
  });

  it('pickInboxContactNameForEdit não usa nome do aluno', () => {
    expect(
      pickInboxContactNameForEdit({
        manualContactName: '',
        whatsappProfileName: 'Maria WA',
        parentName: 'Maria',
      })
    ).toBe('Maria WA');
  });

  it('inboxStudentSubtitle mostra aluno quando difere do contato', () => {
    expect(
      inboxStudentSubtitle({
        leadName: 'João',
        displayName: 'Maria',
        leadType: 'Criança',
      })
    ).toBe('João');

    expect(
      inboxStudentSubtitle({
        leadName: 'João',
        displayName: 'João',
        leadType: 'Criança',
      })
    ).toBe('');
  });

  it('buildInboxDisplayNameArgs mescla lead embutido', () => {
    expect(
      buildInboxDisplayNameArgs({
        lead: { name: 'Bia', type: 'Criança', parentName: 'Paula' },
        leadName: 'Legado',
      })
    ).toMatchObject({
      leadName: 'Bia',
      parentName: 'Paula',
      leadType: 'Criança',
    });
  });
});
