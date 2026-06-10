import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  interpret: vi.fn(),
  execute: vi.fn(),
  notify: vi.fn(),
  record: vi.fn(),
  wasProcessed: vi.fn(),
  writeState: vi.fn(),
  resolveContact: vi.fn(),
}));

vi.mock('./agentActionInterpret.js', () => ({
  interpretAgentAction: (...args) => mocks.interpret(...args),
}));

vi.mock('./agentActionExecute.js', () => ({
  executeAgentAction: (...args) => mocks.execute(...args),
}));

vi.mock('./agentActionNotify.js', () => ({
  notifyTeamOfAiAction: (...args) => mocks.notify(...args),
}));

vi.mock('./agentActionAudit.js', () => ({
  wasActionProcessed: (...args) => mocks.wasProcessed(...args),
  recordAiAction: (...args) => mocks.record(...args),
}));

vi.mock('./agentContactResolve.js', () => ({
  resolveWhatsAppContact: (...args) => mocks.resolveContact(...args),
}));

vi.mock('./conversationsStore.js', () => ({
  readAgentState: (raw) => {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    } catch {
      return {};
    }
  },
  writeAgentState: (...args) => mocks.writeState(...args),
}));

vi.mock('./structuredLog.js', () => ({
  logStructured: vi.fn(),
}));

describe('agentActionExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wasProcessed.mockResolvedValue(false);
    mocks.resolveContact.mockResolvedValue({ kind: 'student', id: 's1', name: 'João', student: {} });
    mocks.interpret.mockResolvedValue({
      action: 'add_conversation_note',
      confidence: 'high',
      data: { note_text: 'Viagem' },
      missing: [],
      summary: 'Nota',
      state_patch: {},
    });
    mocks.execute.mockResolvedValue({ ok: true, summary: 'Nota registrada' });
    mocks.notify.mockResolvedValue({ taskCreated: true });
    mocks.record.mockResolvedValue({});
    mocks.writeState.mockResolvedValue({ ok: true });
  });

  it('executes and notifies on high confidence', async () => {
    const { runAgentActions } = await import('./agentActionExecutor.js');
    await runAgentActions({
      academyId: 'acad1',
      academyDoc: {},
      conversationDoc: { $id: 'conv1', agent_state: '{}' },
      message: 'Vou viajar',
      messageId: 'msg1',
      phone: '11999990000',
      history: [],
      databases: {},
    });
    expect(mocks.execute).toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'add_conversation_note', failed: false })
    );
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'success' }));
  });

  it('skips execution when missing fields', async () => {
    mocks.interpret.mockResolvedValue({
      action: 'update_student',
      confidence: 'medium',
      data: {},
      missing: ['cpf'],
      summary: 'Falta cpf',
      state_patch: { intake: { collected: {} } },
    });
    const { runAgentActions } = await import('./agentActionExecutor.js');
    await runAgentActions({
      academyId: 'acad1',
      academyDoc: {},
      conversationDoc: { $id: 'conv1' },
      message: 'Meu nome é João',
      messageId: 'msg2',
      phone: '11999990000',
      history: [],
      databases: {},
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'skipped' }));
  });

  it('skips when human handoff active', async () => {
    const { runAgentActions } = await import('./agentActionExecutor.js');
    const future = String(Date.now() + 3600000);
    await runAgentActions({
      academyId: 'acad1',
      academyDoc: {},
      conversationDoc: { $id: 'conv1', human_handoff_until: future },
      message: 'Oi',
      messageId: 'msg3',
      phone: '11999990000',
      history: [],
      databases: {},
    });
    expect(mocks.interpret).not.toHaveBeenCalled();
  });
});
