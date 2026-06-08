import { describe, it, expect } from 'vitest';
import { normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { pickInboxDisplayName, formatInboxPhone } from '../lib/inboxContactDisplay.js';

describe('inboxApiUtils', () => {
  it('parse JSON and extract API error message', () => {
    expect(safeParseInboxJson('{"erro":"falhou"}')).toEqual({ erro: 'falhou' });
    expect(normalizeInboxApiError('{"erro":"falhou"}', 'fallback')).toBe('falhou');
    expect(normalizeInboxApiError('', 'fallback')).toBe('fallback');
  });
});

describe('inboxContactDisplay', () => {
  it('prefers lead name then formats phone', () => {
    expect(pickInboxDisplayName({ leadName: 'Ana', phone: '5511999999999' })).toBe('Ana');
    expect(pickInboxDisplayName({ phone: '5511999887766' })).toBe(formatInboxPhone('5511999887766'));
  });

  it('shows friendly label for WhatsApp group ids', () => {
    const groupId = '120363424556468360';
    expect(pickInboxDisplayName({ phone: groupId })).toBe('Grupo · …8360');
    expect(formatInboxPhone(groupId)).toBe('Grupo · …8360');
    expect(pickInboxDisplayName({ manualContactName: 'Turma Noite', phone: groupId })).toBe('Turma Noite');
  });
});
