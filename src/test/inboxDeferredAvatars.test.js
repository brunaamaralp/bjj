import { describe, it, expect } from 'vitest';
import {
  applyAvatarMap,
  applyAvatarToSelected,
  pickPhonesForAvatarFetch,
  selectedConversationNeedsAvatar,
} from '../lib/inboxDeferredAvatars.js';

describe('inboxDeferredAvatars', () => {
  const items = [
    { phone_number: '5511999887766', whatsapp_profile_image_url: 'https://cdn/a.jpg' },
    { phone_number: '11988776655', whatsapp_profile_image_url: '' },
    { phone_number: '5511888776655', whatsapp_profile_image_url: '' },
    { phone_number: '5511777665544', whatsapp_profile_image_url: '' },
  ];

  it('prioriza conversa selecionada sem foto', () => {
    const attempted = new Set();
    const phones = pickPhonesForAvatarFetch(items, '5511888776655', attempted);
    expect(phones[0]).toBe('5511888776655');
  });

  it('pula contatos que já têm foto ou já foram tentados', () => {
    const attempted = new Set(['5511888776655']);
    const phones = pickPhonesForAvatarFetch(items, '5511999887766', attempted);
    expect(phones).not.toContain('5511999887766');
    expect(phones).not.toContain('5511888776655');
    expect(phones).toContain('5511777665544');
  });

  it('aplica mapa de avatares com chave canônica 55', () => {
    const next = applyAvatarMap(items, { '5511888776655': 'https://cdn/new.jpg' });
    const row = next.find((it) => it.phone_number === '5511888776655');
    expect(row?.whatsapp_profile_image_url).toBe('https://cdn/new.jpg');
  });

  it('atualiza selected com telefone normalizado', () => {
    const selected = { phone: '11888776655', whatsapp_profile_image_url: '' };
    const next = applyAvatarToSelected(selected, { '5511888776655': 'https://cdn/x.jpg' });
    expect(next.whatsapp_profile_image_url).toBe('https://cdn/x.jpg');
  });

  it('detecta conversa selecionada sem avatar para fetch imediato', () => {
    expect(selectedConversationNeedsAvatar(items, '5511888776655')).toBe(true);
    expect(selectedConversationNeedsAvatar(items, '5511999887766')).toBe(false);
  });
});
