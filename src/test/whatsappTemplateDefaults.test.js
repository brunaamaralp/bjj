import { describe, it, expect } from 'vitest';
import {
  applyWhatsappTemplatePlaceholders,
  validateTemplatePlaceholders,
  DEFAULT_WHATSAPP_TEMPLATES,
  parseWhatsappTemplatesField,
  serializeWhatsappTemplatesField,
} from '../../lib/whatsappTemplateDefaults.js';

describe('applyWhatsappTemplatePlaceholders', () => {
  it('substitui placeholders conhecidos', () => {
    const text = 'Olá {primeiroNome}, aula {dataAula}{horaAula} na {nomeAcademia}';
    const out = applyWhatsappTemplatePlaceholders(text, {
      lead: { name: 'Maria Silva', scheduledDate: '2026-05-15', scheduledTime: '19:00' },
      academyName: 'Nave BJJ',
    });
    expect(out).toContain('Maria');
    expect(out).toContain('15/05/2026');
    expect(out).toContain('19:00');
    expect(out).toContain('Nave BJJ');
    expect(out).not.toContain('{');
  });

  it('substitui placeholder desconhecido por string vazia', () => {
    const out = applyWhatsappTemplatePlaceholders('Oi {nome_aluno}!', { lead: { name: 'João' } });
    expect(out).toBe('Oi !');
    expect(out).not.toContain('nome_aluno');
  });

  it('retorna string vazia quando texto vazio', () => {
    expect(applyWhatsappTemplatePlaceholders('', { lead: { name: 'Ana' } })).toBe('');
  });

  it('lida com campo de lead ausente', () => {
    const out = applyWhatsappTemplatePlaceholders('Olá {primeiroNome}, {dataAula}', {
      lead: {},
      academyName: 'Academia',
    });
    expect(out).toContain('Olá ,');
    expect(out).not.toContain('{primeiroNome}');
  });
});

describe('validateTemplatePlaceholders', () => {
  it('aceita placeholders conhecidos', () => {
    const r = validateTemplatePlaceholders(DEFAULT_WHATSAPP_TEMPLATES.confirm);
    expect(r.ok).toBe(true);
    expect(r.unknown).toEqual([]);
  });

  it('rejeita placeholder desconhecido', () => {
    const r = validateTemplatePlaceholders('Texto {nome_aluno} aqui');
    expect(r.ok).toBe(false);
    expect(r.unknown).toContain('{nome_aluno}');
  });
});

describe('parseWhatsappTemplatesField', () => {
  it('preserva archive em _meta', () => {
    const raw = serializeWhatsappTemplatesField(
      { ...DEFAULT_WHATSAPP_TEMPLATES, confirm: 'custom' },
      { confirm: { body: 'old', archivedAt: '2026-01-01', archivedBy: 'u1' } }
    );
    const { templates, archive } = parseWhatsappTemplatesField(raw);
    expect(templates.confirm).toBe('custom');
    expect(archive.confirm?.body).toBe('old');
  });
});
