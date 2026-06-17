import { describe, it, expect } from 'vitest';
import { stripUnknownLeadPatch } from '../lib/leadAppwritePatch.js';

describe('stripUnknownLeadPatch', () => {
  it('remove atributo desconhecido citado na mensagem', () => {
    const patch = {
      scheduledDate: '2026-06-20',
      scheduledTime: '19:00',
      status_changed_at: '2026-06-17T12:00:00.000Z',
    };
    const lean = stripUnknownLeadPatch(
      patch,
      'Invalid document structure: Unknown attribute: "status_changed_at"'
    );
    expect(lean).toEqual({
      scheduledDate: '2026-06-20',
      scheduledTime: '19:00',
    });
  });

  it('remove opcionais quando mensagem genérica de unknown attribute', () => {
    const patch = {
      scheduledDate: '2026-06-20',
      status: 'Agendado',
      pipeline_stage_changed_at: '2026-06-17T12:00:00.000Z',
    };
    const lean = stripUnknownLeadPatch(patch, 'Unknown attribute');
    expect(lean).toEqual({
      scheduledDate: '2026-06-20',
      status: 'Agendado',
    });
  });
});
