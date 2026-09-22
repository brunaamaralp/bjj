import { describe, it, expect } from 'vitest';
import { mapNotificationDoc } from '../../lib/server/mapNotificationDoc.js';

describe('mapNotificationDoc', () => {
  it('maps profile_note with body snapshot and flags', () => {
    const mapped = mapNotificationDoc({
      $id: 'n1',
      type: 'profile_note',
      lead_name: 'João Silva',
      lead_id: 'stu-1',
      created_by_name: 'Bruna',
      created_by_user_id: 'u1',
      created_at: '2026-09-22T12:00:00.000Z',
      body: 'Aluno pediu para alterar o vencimento para dia 10.',
      action_url: '/student/stu-1?tab=timeline',
      note_id: 'ev-1',
      conversation_id: 'profile',
      academy_id: 'acad-1',
    });
    expect(mapped.is_profile_note).toBe(true);
    expect(mapped.is_system).toBe(false);
    expect(mapped.title).toBe('João Silva');
    expect(mapped.body).toContain('vencimento');
    expect(mapped.action_url).toBe('/student/stu-1?tab=timeline');
    expect(mapped.created_by_name).toBe('Bruna');
  });

  it('keeps inbox mention shape without treating as profile_note', () => {
    const mapped = mapNotificationDoc({
      $id: 'n2',
      lead_name: 'Maria',
      created_by_name: 'Ana',
      created_at: '2026-09-22T12:00:00.000Z',
      conversation_id: 'c1',
      phone_number: '5511999',
    });
    expect(mapped.is_profile_note).toBe(false);
    expect(mapped.is_system).toBe(false);
    expect(mapped.title).toBeNull();
    expect(mapped.body).toBeNull();
  });

  it('maps system notifications using lead_name/created_by_name', () => {
    const mapped = mapNotificationDoc({
      $id: 'n3',
      type: 'whatsapp_disconnected',
      lead_name: 'WhatsApp desconectado',
      created_by_name: 'Reconecte em Integrações',
      created_at: '2026-09-22T12:00:00.000Z',
      action_url: '/integracoes?tab=whatsapp',
    });
    expect(mapped.is_system).toBe(true);
    expect(mapped.title).toBe('WhatsApp desconectado');
    expect(mapped.body).toBe('Reconecte em Integrações');
  });
});
