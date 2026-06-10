import { describe, expect, it } from 'vitest';
import {
  INBOX_LIST_ITEM_ROW_HEIGHT,
  INBOX_MSG_TRUNCATE_CHARS,
  truncateInboxMessageText,
  isInboxTruncatableTextMessage,
} from '../lib/inboxUiConstants.js';

describe('INBOX_LIST_ITEM_ROW_HEIGHT', () => {
  it('alinha com altura da linha compacta da lista (virtualizer)', () => {
    expect(INBOX_LIST_ITEM_ROW_HEIGHT).toBe(72);
  });
});

describe('truncateInboxMessageText', () => {
  it('não trunca abaixo do limite', () => {
    expect(truncateInboxMessageText('Olá mundo', 600)).toBe('Olá mundo');
  });

  it('trunca acima de 600 chars com reticências', () => {
    const long = 'a'.repeat(650);
    const out = truncateInboxMessageText(long, 600);
    expect(out.length).toBeLessThanOrEqual(601);
    expect(out.endsWith('…')).toBe(true);
  });

  it('prefere quebra em espaço', () => {
    const words = Array.from({ length: 120 }, (_, i) => `palavra${i}`).join(' ');
    expect(words.length).toBeGreaterThan(INBOX_MSG_TRUNCATE_CHARS);
    const out = truncateInboxMessageText(words, INBOX_MSG_TRUNCATE_CHARS);
    expect(out.endsWith('…')).toBe(true);
    expect(out.includes('palavra119')).toBe(false);
  });
});

describe('isInboxTruncatableTextMessage', () => {
  it('aceita mensagem de texto sem type', () => {
    expect(
      isInboxTruncatableTextMessage({ content: 'oi' }, { isImageMsg: false, isAudioMsg: false, otherMediaKind: null })
    ).toBe(true);
  });

  it('rejeita imagem', () => {
    expect(
      isInboxTruncatableTextMessage(
        { type: 'image', content: 'x' },
        { isImageMsg: true, isAudioMsg: false, otherMediaKind: null }
      )
    ).toBe(false);
  });

  it('rejeita áudio', () => {
    expect(
      isInboxTruncatableTextMessage(
        { type: 'audio', content: 'x' },
        { isImageMsg: false, isAudioMsg: true, otherMediaKind: null }
      )
    ).toBe(false);
  });
});
