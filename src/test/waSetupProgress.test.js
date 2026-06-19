import { describe, it, expect } from 'vitest';
import { buildWaAgentJourneyProgress, isWaSetupStepDone } from '../lib/waSetupProgress.js';

describe('waSetupProgress', () => {
  it('isWaSetupStepDone — conectado ou instância pareada', () => {
    expect(isWaSetupStepDone({ waConnected: true, waStatus: 'online', instanceId: 'x' })).toBe(true);
    expect(isWaSetupStepDone({ waConnected: false, waStatus: 'offline', instanceId: 'x' })).toBe(true);
    expect(isWaSetupStepDone({ waConnected: false, waStatus: 'disconnected', instanceId: null })).toBe(false);
  });

  it('buildWaAgentJourneyProgress — sequência de passos', () => {
    const step1 = buildWaAgentJourneyProgress({
      waConnected: false,
      waStatus: 'disconnected',
      instanceId: null,
      promptConfigurado: false,
      iaAtiva: false,
    });
    expect(step1).toMatchObject({ waDone: false, configDone: false, activeDone: false, currentStep: 1 });

    const step2 = buildWaAgentJourneyProgress({
      waConnected: true,
      waStatus: 'online',
      instanceId: 'inst',
      promptConfigurado: false,
      iaAtiva: false,
    });
    expect(step2).toMatchObject({ waDone: true, configDone: false, currentStep: 2 });

    const step3 = buildWaAgentJourneyProgress({
      waConnected: true,
      waStatus: 'online',
      instanceId: 'inst',
      promptConfigurado: true,
      iaAtiva: false,
    });
    expect(step3).toMatchObject({ configDone: true, currentStep: 3, statusLine: 'Conectado, mas atendimento pausado' });

    const done = buildWaAgentJourneyProgress({
      waConnected: true,
      waStatus: 'online',
      instanceId: 'inst',
      promptConfigurado: true,
      iaAtiva: true,
    });
    expect(done).toMatchObject({ activeDone: true, currentStep: 0, statusLine: '' });
  });
});
