import { describe, it, expect, beforeEach } from 'vitest';
import { useLeadStore, patchLeadInStore, revertLeadsInStore } from '../store/useLeadStore.js';

describe('patchLeadInStore', () => {
  beforeEach(() => {
    useLeadStore.setState({
      leads: [{ id: 'l1', name: 'Ana', pipelineStage: 'Novo' }],
      leadsById: { l1: { id: 'l1', name: 'Ana', pipelineStage: 'Novo' } },
    });
  });

  it('sincroniza leads e leadsById', () => {
    patchLeadInStore('l1', { pipelineStage: 'Primeiro contato' });

    const state = useLeadStore.getState();
    expect(state.leads[0].pipelineStage).toBe('Primeiro contato');
    expect(state.leadsById.l1.pipelineStage).toBe('Primeiro contato');
    expect(useLeadStore.getState().getLeadById('l1')?.pipelineStage).toBe('Primeiro contato');
  });

  it('revertLeadsInStore restaura índice', () => {
    const snapshot = useLeadStore.getState().leads;
    patchLeadInStore('l1', { pipelineStage: 'Primeiro contato' });
    revertLeadsInStore(snapshot);

    const state = useLeadStore.getState();
    expect(state.leads[0].pipelineStage).toBe('Novo');
    expect(state.leadsById.l1.pipelineStage).toBe('Novo');
  });
});
