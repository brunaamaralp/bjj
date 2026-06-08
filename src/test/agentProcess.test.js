import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from './helpers/httpMock.js';

const apMocks = vi.hoisted(() => ({
  sendZapsterText: vi.fn(),
  createNotification: vi.fn().mockResolvedValue({ ok: true }),
  logStructured: vi.fn(),
  updateMerge: vi.fn(),
  findConversation: vi.fn(),
  tryAcquireAgentLock: vi.fn().mockResolvedValue({ acquired: true }),
  releaseAgentLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/server/zapsterSend.js', () => ({
  sendZapsterText: (...args) => apMocks.sendZapsterText(...args)
}));

vi.mock('../../lib/server/internalNotification.js', () => ({
  createInternalNotification: (...args) => apMocks.createNotification(...args)
}));

vi.mock('../../lib/server/structuredLog.js', () => ({
  logStructured: (...args) => apMocks.logStructured(...args)
}));

vi.mock('../../lib/server/conversationsStore.js', () => ({
  getAcademyDocument: vi.fn().mockResolvedValue({
    $id: 'acad-1',
    status: 'active',
    ia_ativa: true,
    zapster_instance_id: 'inst-1',
    billing_cycle_day: 1,
    plan: 'pro'
  }),
  getOrCreateConversationDoc: vi.fn(),
  getConversationDocById: vi.fn(),
  findConversationDoc: (...args) => apMocks.findConversation(...args),
  updateConversationWithMerge: (...args) => apMocks.updateMerge(...args),
  updateConversationAiThreadCycle: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../../src/services/planService.js', () => ({
  getCurrentBillingCycleId: vi.fn(() => '2026-05'),
  checkAiQuota: vi.fn(() => ({ allowed: true, overage: false })),
  incrementAiThreads: vi.fn()
}));

vi.mock('../../lib/server/billingGate.js', () => ({
  assertBillingActive: vi.fn(async () => {}),
  BillingGateError: class BillingGateError extends Error {}
}));

vi.mock('../../lib/server/agentProcessingLock.js', () => ({
  tryAcquireAgentLock: (...args) => apMocks.tryAcquireAgentLock(...args),
  releaseAgentLock: (...args) => apMocks.releaseAgentLock(...args),
}));

describe('agentProcess — falha no envio Zapster', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.INTERNAL_API_SECRET = 'internal-secret';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://app.test';

    apMocks.sendZapsterText.mockReset();
    apMocks.sendZapsterText.mockResolvedValue({ ok: false, erro: 'zapster down' });
    apMocks.createNotification.mockClear();
    apMocks.logStructured.mockClear();
    apMocks.updateMerge.mockClear();
    apMocks.findConversation.mockResolvedValue({
      $id: 'conv-99',
      academy_id: 'acad-1',
      ai_thread_cycle_id: '2026-05'
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            sucesso: true,
            resposta: 'Resposta gerada pela IA',
            deferred_merge: {
              doc_id: 'conv-99',
              additions: [{ role: 'assistant', content: 'Resposta gerada pela IA', timestamp: new Date().toISOString() }]
            }
          })
      }))
    );
  });

  it('cria notificação agent_send_failed e não grava merge após falha', async () => {
    const { default: handler } = await import('../../lib/server/agentProcess.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'internal-secret'
      },
      body: {
        phone: '5511999776655',
        name: 'Aluno',
        academyId: 'acad-1',
        message: 'Quanto custa?',
        messageId: 'msg-out-1',
        outInstanceId: 'inst-1'
      }
    });

    await handler(req, res);

    expect(state.statusCode).toBe(200);
    expect(state.body?.sent).toBe(false);
    expect(state.body?.reason).toBe('zapster_send_failed');
    expect(apMocks.sendZapsterText.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(apMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_send_failed',
        action_url: expect.stringContaining('5511999776655')
      })
    );
    expect(apMocks.logStructured).toHaveBeenCalledWith(
      'agent_send_failed',
      expect.objectContaining({ event: 'agent_send_failed', phone: '5511999776655' })
    );
    expect(apMocks.updateMerge).not.toHaveBeenCalled();
    expect(apMocks.releaseAgentLock).toHaveBeenCalledWith('conv-99');
  });

  it('ignora mensagem quando lock distribuído está ativo', async () => {
    apMocks.tryAcquireAgentLock.mockReset();
    apMocks.releaseAgentLock.mockReset();
    apMocks.tryAcquireAgentLock.mockResolvedValueOnce({ acquired: false, reason: 'lock_active' });

    const { default: handler } = await import('../../lib/server/agentProcess.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'internal-secret',
      },
      body: {
        phone: '5511999776655',
        name: 'Aluno',
        academyId: 'acad-1',
        message: 'Oi',
        messageId: 'msg-2',
        outInstanceId: 'inst-1',
      },
    });

    await handler(req, res);

    expect(state.statusCode).toBe(200);
    expect(state.body?.ignored).toBe(true);
    expect(state.body?.reason).toBe('lock_active');
    expect(apMocks.sendZapsterText).not.toHaveBeenCalled();
    expect(apMocks.releaseAgentLock).not.toHaveBeenCalled();
  });
});
