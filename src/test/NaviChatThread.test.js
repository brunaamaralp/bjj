import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NaviChatThread, { chatMessagePreview, chatMessageHasVisibleBody } from '../components/chat-widget/NaviChatThread.jsx';

describe('NaviChatThread helpers', () => {
  it('não usa placeholder de sticker como texto', () => {
    const msg = { type: 'sticker', content: '🖼️ [Sticker recebido]', mediaUrl: 'https://cdn.example/sticker.webp' };
    expect(chatMessagePreview(msg)).toBeNull();
    expect(chatMessageHasVisibleBody(msg)).toBe(true);
  });

  it('mantém preview de texto normal', () => {
    const msg = { type: 'text', content: 'Olá!' };
    expect(chatMessagePreview(msg)).toBe('Olá!');
    expect(chatMessageHasVisibleBody(msg)).toBe(true);
  });
});

describe('NaviChatThread sticker rendering', () => {
  it('renderiza img da figurinha em vez do placeholder', () => {
    const { container } = render(
      React.createElement(NaviChatThread, {
        messages: [
          {
            role: 'user',
            type: 'sticker',
            content: '🖼️ [Sticker recebido]',
            mediaUrl: 'https://cdn.example/sticker.webp',
            timestamp: '2026-06-15T12:00:00.000Z',
          },
        ],
        loading: false,
        phoneDigits: '5511999999999',
      })
    );

    const img = container.querySelector('img.inbox-media-bubble__img--sticker');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://cdn.example/sticker.webp');
    expect(container.textContent).not.toContain('[Sticker recebido]');
  });
});
