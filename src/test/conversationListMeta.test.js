import { describe, it, expect } from 'vitest';
import {
  deriveLastMessageMeta,
  hasStoredLastMessageMeta,
  readStoredLastMessageMeta,
  lastMessageMetaPayload,
} from '../../lib/server/conversationListMeta.js';

describe('conversationListMeta', () => {
  it('deriveLastMessageMeta returns empty for no messages', () => {
    expect(deriveLastMessageMeta([])).toEqual({
      last_preview: '',
      last_message_role: '',
      last_message_sender: '',
      last_message_timestamp: '',
    });
  });

  it('deriveLastMessageMeta picks last message chronologically', () => {
    const meta = deriveLastMessageMeta([
      { role: 'user', content: 'Oi', timestamp: '2026-01-01T10:00:00.000Z' },
      { role: 'assistant', content: 'Olá!', timestamp: '2026-01-01T10:01:00.000Z', sender: 'ai' },
    ]);
    expect(meta.last_preview).toBe('Olá!');
    expect(meta.last_message_role).toBe('assistant');
    expect(meta.last_message_sender).toBe('ai');
    expect(meta.last_message_timestamp).toBe('2026-01-01T10:01:00.000Z');
  });

  it('deriveLastMessageMeta normalizes preview whitespace and underscores', () => {
    const meta = deriveLastMessageMeta([
      { role: 'user', content: 'texto__com   espaços', timestamp: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(meta.last_preview).toBe('texto com espaços');
    expect(meta.last_message_role).toBe('user');
  });

  it('hasStoredLastMessageMeta detects stored fields', () => {
    expect(hasStoredLastMessageMeta({})).toBe(false);
    expect(hasStoredLastMessageMeta({ last_preview: 'hi' })).toBe(true);
    expect(hasStoredLastMessageMeta({ last_message_timestamp: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('readStoredLastMessageMeta reads doc fields', () => {
    expect(
      readStoredLastMessageMeta({
        last_preview: 'p',
        last_message_role: 'user',
        last_message_sender: 'human',
        last_message_timestamp: 't',
      }),
    ).toEqual({
      last_preview: 'p',
      last_message_role: 'user',
      last_message_sender: 'human',
      last_message_timestamp: 't',
    });
  });

  it('lastMessageMetaPayload equals deriveLastMessageMeta', () => {
    const msgs = [{ role: 'user', content: 'x', timestamp: '2026-01-03T00:00:00.000Z' }];
    expect(lastMessageMetaPayload(msgs)).toEqual(deriveLastMessageMeta(msgs));
  });
});
