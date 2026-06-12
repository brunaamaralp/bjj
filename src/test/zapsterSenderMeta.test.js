import { describe, it, expect } from 'vitest';
import { pickSenderProfileImageUrl } from '../../lib/server/zapsterSenderMeta.js';

describe('pickSenderProfileImageUrl', () => {
  it('lê sender.profile_picture (campo Zapster)', () => {
    expect(
      pickSenderProfileImageUrl({
        sender: { profile_picture: 'https://example.com/wa.jpg' },
      })
    ).toBe('https://example.com/wa.jpg');
  });

  it('lê contact.profile_picture no payload raiz', () => {
    expect(
      pickSenderProfileImageUrl({
        contact: { profile_picture: 'https://example.com/contact.jpg' },
      })
    ).toBe('https://example.com/contact.jpg');
  });

  it('retorna vazio sem URL http(s)', () => {
    expect(pickSenderProfileImageUrl({ sender: { profile_picture: 'not-a-url' } })).toBe('');
    expect(pickSenderProfileImageUrl(null)).toBe('');
  });
});
