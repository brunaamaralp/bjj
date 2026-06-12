import { describe, it, expect } from 'vitest';

// Test heuristic path only (no API)
describe('agentActionInterpret heuristic', () => {
  it('detects freeze confirmation', async () => {
    const { interpretAgentAction } = await import('./agentActionInterpret.js');
    const out = await interpretAgentAction({
      message: 'Confirmo, pode trancar',
      history: [],
      agentState: {
        freeze_pending: {
          awaiting_confirmation: true,
          start_ymd: '2026-06-10',
          duration_days: 30,
          reason: 'Viagem',
        },
      },
      contact: { kind: 'student', id: 's1', name: 'João' },
      phone: '11999990000',
    });
    expect(out.action).toBe('freeze_plan');
    expect(out.confidence).toBe('high');
    expect(out.missing).toEqual([]);
  });

  it('detects child info from parent message without API', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { interpretAgentAction } = await import('./agentActionInterpret.js');
    const out = await interpretAgentAction({
      message: 'Quero aula para minha filha Manuela, ela tem 6 anos',
      history: [],
      agentState: {},
      contact: {
        kind: 'lead',
        id: 'L1',
        name: '37999998888',
        doc: { name: '37999998888', phone: '37999998888' },
      },
      phone: '37999998888',
    });
    if (orig) process.env.ANTHROPIC_API_KEY = orig;
    expect(out.action).toBe('update_student');
    expect(out.confidence).toBe('high');
    expect(out.data?.name || out.state_patch?.intake?.collected?.name).toMatch(/Manuela/i);
    expect(out.timeline_highlight?.confidence).toBe('high');
    expect(out.timeline_highlight?.text).toBeTruthy();
  });

  it('detects travel aviso as conversation note without API', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { interpretAgentAction } = await import('./agentActionInterpret.js');
    const out = await interpretAgentAction({
      message: 'Vou viajar semana que vem',
      history: [],
      agentState: {},
      contact: { kind: 'student', id: 's1', name: 'João' },
      phone: '11999990000',
    });
    if (orig) process.env.ANTHROPIC_API_KEY = orig;
    expect(out.action).toBe('add_conversation_note');
    expect(out.confidence).toBe('high');
  });
});
