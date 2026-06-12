import { describe, it, expect, vi } from 'vitest';
import {
  computeLeadHistoryFingerprint,
  parseStoredLeadHistorySummary,
  serializeLeadHistorySummary,
  isSummaryFresh,
  buildLeadHistoryContextBlock,
  resolveLeadHistorySummary,
  parseSummaryGenerationResponse,
  evaluateLeadHistorySummaryCache,
  formatContextTimestamp,
} from './leadHistorySummary.js';

describe('leadHistorySummary', () => {
  const baseLead = { $updatedAt: '2026-06-10T10:00:00.000Z', status: 'Novo', pipeline_stage: 'Contato' };

  describe('computeLeadHistoryFingerprint', () => {
    it('changes when last message timestamp changes', () => {
      const base = { lead: baseLead, messages: [{ at: '2026-06-10T10:00:00.000Z' }], events: [] };
      const a = computeLeadHistoryFingerprint(base);
      const b = computeLeadHistoryFingerprint({
        ...base,
        messages: [{ at: '2026-06-11T10:00:00.000Z' }],
      });
      expect(a).not.toBe(b);
    });

    it('changes when pipeline_stage changes', () => {
      const base = { lead: baseLead, messages: [], events: [] };
      expect(computeLeadHistoryFingerprint(base)).not.toBe(
        computeLeadHistoryFingerprint({
          ...base,
          lead: { ...baseLead, pipeline_stage: 'Experimental' },
        })
      );
    });

    it('changes when event count changes', () => {
      const base = { lead: baseLead, messages: [], events: [] };
      const withEvent = {
        ...base,
        events: [{ at: '2026-06-10T12:00:00.000Z', type: 'note', text: 'x' }],
      };
      expect(computeLeadHistoryFingerprint(base)).not.toBe(computeLeadHistoryFingerprint(withEvent));
    });
  });

  describe('parseStoredLeadHistorySummary', () => {
    it('parses valid JSON', () => {
      const raw = serializeLeadHistorySummary({
        text: 'Resumo teste',
        pontos_chave: ['Interesse em horários'],
        pendencias_mencionadas: [],
        generated_at: '2026-06-12T10:00:00.000Z',
        context_fingerprint: 'fp1',
        source_counts: { messages: 3, events: 1 },
      });
      const parsed = parseStoredLeadHistorySummary(raw);
      expect(parsed?.text).toBe('Resumo teste');
      expect(parsed?.pontos_chave).toEqual(['Interesse em horários']);
      expect(parsed?.context_fingerprint).toBe('fp1');
    });

    it('returns null for empty', () => {
      expect(parseStoredLeadHistorySummary('')).toBeNull();
      expect(parseStoredLeadHistorySummary('{}')).toBeNull();
    });
  });

  describe('isSummaryFresh', () => {
    it('returns true when fingerprints match', () => {
      const fp = 'abc|def';
      const stored = parseStoredLeadHistorySummary(
        serializeLeadHistorySummary({
          text: 'x',
          context_fingerprint: fp,
          generated_at: '2026-06-12T10:00:00.000Z',
        })
      );
      expect(isSummaryFresh(stored, fp)).toBe(true);
    });

    it('returns false when fingerprints differ', () => {
      const stored = parseStoredLeadHistorySummary(
        serializeLeadHistorySummary({
          text: 'x',
          context_fingerprint: 'old',
          generated_at: '2026-06-12T10:00:00.000Z',
        })
      );
      expect(isSummaryFresh(stored, 'new')).toBe(false);
    });
  });

  describe('buildLeadHistoryContextBlock', () => {
    it('includes timestamps and PT labels for events', () => {
      const block = buildLeadHistoryContextBlock({
        lead: { ...baseLead, name: 'Ana', pipeline_stage: 'Aguardando' },
        messages: [{ role: 'cliente', content: 'Oi', at: '2026-06-10T14:00:00.000Z' }],
        events: [{ type: 'schedule', text: 'Aula marcada', at: '2026-06-09T10:00:00.000Z' }],
        academyName: 'Academia Teste',
        forSummary: true,
      });
      expect(block).toContain('Etapa funil: Aguardando');
      expect(block).toContain('(agendamento)');
      expect(block).toContain('cliente: Oi');
      expect(formatContextTimestamp('2026-06-10T14:00:00.000Z')).toBeTruthy();
    });

    it('notes truncation when messages exceed window', () => {
      const messages = Array.from({ length: 25 }, (_, i) => ({
        role: 'cliente',
        content: `msg ${i}`,
        at: `2026-06-10T${String(i).padStart(2, '0')}:00:00.000Z`,
      }));
      const block = buildLeadHistoryContextBlock({
        lead: baseLead,
        messages,
        events: [],
        academyName: 'X',
        messageWindow: 20,
        totalMessageCount: 25,
      });
      expect(block).toContain('Mostrando 20 de 25 mensagens');
    });
  });

  describe('parseSummaryGenerationResponse', () => {
    it('extracts structured fields from JSON', () => {
      const raw = '{"summary":"Texto","pontos_chave":["A"],"pendencias_mencionadas":[]}';
      expect(parseSummaryGenerationResponse(raw)).toEqual({
        summary: 'Texto',
        pontos_chave: ['A'],
        pendencias_mencionadas: [],
      });
    });

    it('parses JSON wrapped in markdown fence', () => {
      const raw = '```json\n{"summary":"Com fence","pontos_chave":[],"pendencias_mencionadas":[]}\n```';
      expect(parseSummaryGenerationResponse(raw).summary).toBe('Com fence');
    });

    it('falls back to raw text when JSON invalid', () => {
      expect(parseSummaryGenerationResponse('Texto puro sem json').summary).toBe('Texto puro sem json');
    });
  });

  describe('evaluateLeadHistorySummaryCache', () => {
    it('returns has_cache false when empty', () => {
      const out = evaluateLeadHistorySummaryCache({
        lead: baseLead,
        messages: [],
        events: [],
      });
      expect(out.has_cache).toBe(false);
    });

    it('returns stale when fingerprint changed', () => {
      const messages = [{ at: '2026-06-10T10:00:00.000Z', role: 'cliente', content: 'Oi' }];
      const fp = computeLeadHistoryFingerprint({ lead: baseLead, messages, events: [] });
      const lead = {
        ...baseLead,
        ai_history_summary_json: serializeLeadHistorySummary({
          text: 'cached',
          context_fingerprint: fp,
          generated_at: '2026-06-12T10:00:00.000Z',
        }),
      };
      const fresh = evaluateLeadHistorySummaryCache({ lead, messages, events: [] });
      expect(fresh.has_cache).toBe(true);
      expect(fresh.stale).toBe(false);

      const stale = evaluateLeadHistorySummaryCache({
        lead,
        messages: [{ at: '2026-06-11T10:00:00.000Z', role: 'cliente', content: 'Nova' }],
        events: [],
      });
      expect(stale.stale).toBe(true);
    });
  });

  describe('resolveLeadHistorySummary', () => {
    const fixtures = {
      lead: {
        ...baseLead,
        ai_history_summary_json: serializeLeadHistorySummary({
          text: 'cached',
          context_fingerprint: computeLeadHistoryFingerprint({
            lead: baseLead,
            messages: [{ at: '2026-06-10T10:00:00.000Z' }],
            events: [],
          }),
          generated_at: '2026-06-12T10:00:00.000Z',
        }),
      },
      messages: [{ at: '2026-06-10T10:00:00.000Z', role: 'cliente', content: 'Oi' }],
      events: [],
      contextBlock: 'ctx',
    };

    it('returns cache when fingerprint matches and not forceRefresh', async () => {
      const generateFn = vi.fn();
      const out = await resolveLeadHistorySummary({
        ...fixtures,
        forceRefresh: false,
        generateFn,
      });
      expect(out.from_cache).toBe(true);
      expect(out.stale).toBe(false);
      expect(out.summary).toBe('cached');
      expect(generateFn).not.toHaveBeenCalled();
    });

    it('returns stale cache when fingerprint differs and not forceRefresh', async () => {
      const generateFn = vi.fn();
      const out = await resolveLeadHistorySummary({
        ...fixtures,
        messages: [{ at: '2026-06-11T10:00:00.000Z', role: 'cliente', content: 'Nova' }],
        forceRefresh: false,
        generateFn,
      });
      expect(out.from_cache).toBe(true);
      expect(out.stale).toBe(true);
      expect(out.summary).toBe('cached');
      expect(generateFn).not.toHaveBeenCalled();
    });

    it('calls generate when forceRefresh even if fresh', async () => {
      const generateFn = vi.fn().mockResolvedValue({
        summary: 'fresh',
        pontos_chave: [],
        pendencias_mencionadas: [],
      });
      const out = await resolveLeadHistorySummary({
        ...fixtures,
        forceRefresh: true,
        generateFn,
      });
      expect(generateFn).toHaveBeenCalled();
      expect(out.from_cache).toBe(false);
      expect(out.stale).toBe(false);
      expect(out.summary).toBe('fresh');
      expect(out.serialized).toBeTruthy();
    });

    it('generates when no stored summary', async () => {
      const generateFn = vi.fn().mockResolvedValue({
        summary: 'novo',
        pontos_chave: ['P1'],
        pendencias_mencionadas: [],
      });
      const out = await resolveLeadHistorySummary({
        lead: baseLead,
        messages: fixtures.messages,
        events: [],
        contextBlock: 'ctx',
        forceRefresh: false,
        generateFn,
      });
      expect(generateFn).toHaveBeenCalled();
      expect(out.summary).toBe('novo');
      expect(out.pontos_chave).toEqual(['P1']);
    });
  });
});
