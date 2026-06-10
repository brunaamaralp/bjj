import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MediaBubble, { resolveInboxMessageDisplayType } from '../components/inbox/MediaBubble.jsx';

vi.mock('../components/inbox/InboxMediaImage.jsx', () => ({
  default: ({ mediaUrl }) => <div data-testid="inbox-image">{mediaUrl}</div>,
}));

vi.mock('../components/inbox/InboxAudioPlayer.jsx', () => ({
  default: ({ mediaUrl }) => <audio data-testid="inbox-audio" src={mediaUrl} />,
}));

vi.mock('../components/inbox/InboxMediaPlaceholder.jsx', () => ({
  default: ({ kind }) => <div data-testid="inbox-placeholder">{kind}</div>,
}));

vi.mock('../components/inbox/InboxMessageText.jsx', () => ({
  default: ({ content }) => <span data-testid="inbox-text">{content}</span>,
}));

describe('resolveInboxMessageDisplayType', () => {
  it('usa campo type da mensagem', () => {
    expect(resolveInboxMessageDisplayType({ type: 'sticker' })).toBe('sticker');
    expect(resolveInboxMessageDisplayType({ type: 'document' })).toBe('document');
    expect(resolveInboxMessageDisplayType({ type: 'ptt' })).toBe('audio');
  });

  it('infere tipo legado pelo conteúdo', () => {
    expect(resolveInboxMessageDisplayType({}, '🖼️ [Sticker recebido]')).toBe('sticker');
    expect(resolveInboxMessageDisplayType({}, '📄 [Documento recebido]')).toBe('document');
  });
});

describe('MediaBubble', () => {
  it('renderiza imagem com mediaUrl (não content)', () => {
    render(
      <MediaBubble
        message={{
          type: 'image',
          content: '[imagem]',
          mediaUrl: 'https://appwrite.test/stored.jpg',
        }}
      />
    );
    expect(screen.getByTestId('inbox-image')).toHaveTextContent('https://appwrite.test/stored.jpg');
  });

  it('renderiza sticker como img quando há URL', () => {
    const { container } = render(
      <MediaBubble
        message={{
          type: 'sticker',
          content: '🖼️ [Sticker recebido]',
          mediaUrl: 'https://appwrite.test/sticker.webp',
        }}
      />
    );
    const img = container.querySelector('img.inbox-media-bubble__img--sticker');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://appwrite.test/sticker.webp');
  });

  it('renderiza áudio com controls', () => {
    render(
      <MediaBubble
        message={{
          type: 'audio',
          content: '🎵 [Áudio recebido]',
          mediaUrl: 'https://appwrite.test/voice.ogg',
          mimeType: 'audio/ogg',
        }}
      />
    );
    expect(screen.getByTestId('inbox-audio')).toHaveAttribute('src', 'https://appwrite.test/voice.ogg');
  });

  it('renderiza documento com link quando há URL', () => {
    render(
      <MediaBubble
        message={{
          type: 'document',
          content: '📄 [Documento recebido]',
          mediaUrl: 'https://appwrite.test/doc.pdf',
          fileName: 'contrato.pdf',
        }}
      />
    );
    expect(screen.getByRole('button', { name: /Abrir documento/i })).toBeTruthy();
    expect(screen.getByText('contrato.pdf')).toBeTruthy();
  });

  it('cai em texto para mensagens sem mídia', () => {
    render(
      <MediaBubble
        message={{
          type: 'text',
          content: 'Olá!',
        }}
      />
    );
    expect(screen.getByTestId('inbox-text')).toHaveTextContent('Olá!');
  });
});
