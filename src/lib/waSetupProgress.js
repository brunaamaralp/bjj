import { WA_CONNECTED_STATUSES, WA_PAUSED_STATUSES } from './resolveWhatsAppIntegrationStatus.js';

export const WA_SETUP_STEP_LABELS = {
  connect: 'Conectar WhatsApp',
  configure: 'Configurar assistente',
  activate: 'Ativar atendimento',
};

/** Passo 1 concluído quando há instância pareada (conectada ou pausada). */
export function isWaSetupStepDone({ waConnected, waStatus, instanceId }) {
  if (waConnected) return true;
  const id = String(instanceId || '').trim();
  if (!id) return false;
  const st = String(waStatus || '').trim().toLowerCase();
  return WA_CONNECTED_STATUSES.has(st) || WA_PAUSED_STATUSES.has(st);
}

/**
 * Progresso da jornada WhatsApp → assistente → ativação.
 * @returns {{ waDone: boolean, configDone: boolean, activeDone: boolean, currentStep: number, statusLine: string }}
 */
export function buildWaAgentJourneyProgress({
  waConnected,
  waStatus,
  instanceId,
  promptConfigurado = false,
  iaAtiva = false,
}) {
  const waDone = isWaSetupStepDone({ waConnected, waStatus, instanceId });
  const configDone = Boolean(promptConfigurado);
  const activeDone = Boolean(iaAtiva);

  let currentStep = 1;
  if (waDone && !configDone) currentStep = 2;
  else if (waDone && configDone && !activeDone) currentStep = 3;
  else if (waDone && configDone && activeDone) currentStep = 0;

  let statusLine = '';
  if (waDone && configDone && !activeDone) {
    statusLine = 'Conectado, mas atendimento pausado';
  }

  return { waDone, configDone, activeDone, currentStep, statusLine };
}
