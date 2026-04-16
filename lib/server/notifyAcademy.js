/**
 * Notifica o dono da academia via WhatsApp (best-effort).
 * Se o WhatsApp não estiver configurado, apenas loga.
 *
 * Tipos suportados:
 *  - quota_80pct
 *  - quota_100pct
 *  - trial_expiring_3days
 *  - trial_expiring_1day
 *  - trial_expired
 */
import { sendZapsterText } from './zapsterSend.js';

function buildMessage(type, academy, data = {}) {
  const name = String(academy?.name || 'sua academia');

  switch (type) {
    case 'quota_80pct':
      return [
        `Olá! 👋 Aqui é o Nave.`,
        ``,
        `Sua academia *${name}* já usou *80%* das conversas de IA do mês.`,
        ``,
        `📊 Uso atual: ${data.used} de ${data.limit} conversas`,
        ``,
        `Para continuar atendendo seus leads sem interrupção, considere fazer upgrade do seu plano em nave.app/planos`,
        ``,
        `O contador reseta em ${data.resetDate}.`,
      ].join('\n');

    case 'quota_100pct':
      return [
        `⚠️ Atenção, *${name}*!`,
        ``,
        `Sua quota de conversas de IA foi atingida este mês.`,
        ``,
        `📊 ${data.used} de ${data.limit} conversas usadas`,
        ``,
        `A partir de agora, leads que enviarem mensagens receberão uma resposta automática informando que entrarão em contato em breve.`,
        ``,
        `Para reativar o atendimento automático, faça upgrade em nave.app/planos`,
        ``,
        `O contador reseta em ${data.resetDate}.`,
      ].join('\n');

    case 'trial_expiring_3days':
      return [
        `Olá, *${name}*! 👋`,
        ``,
        `Seu período de teste do Nave encerra em *3 dias*.`,
        ``,
        `Para continuar com o atendimento automático por WhatsApp, escolha seu plano em nave.app/planos`,
        ``,
        `🟣 Starter — R$ 297/mês (300 conversas)`,
        `🔵 Studio  — R$ 597/mês (800 conversas)`,
        `⚡ Pro     — R$ 997/mês (2.000 conversas)`,
        ``,
        `Qualquer dúvida, estamos aqui!`,
      ].join('\n');

    case 'trial_expiring_1day':
      return [
        `⏰ *${name}*, seu trial encerra *amanhã*!`,
        ``,
        `Não perca o acesso ao atendimento automático por WhatsApp.`,
        ``,
        `Assine agora em nave.app/planos e continue convertendo leads automaticamente.`,
      ].join('\n');

    case 'trial_expired':
      return [
        `Olá, *${name}*.`,
        ``,
        `Seu período de teste encerrou hoje.`,
        ``,
        `O atendimento automático por WhatsApp está pausado.`,
        ``,
        `Para reativar, escolha um plano em nave.app/planos`,
      ].join('\n');

    default:
      return null;
  }
}

/**
 * @param {Record<string, unknown>} academy  Documento da academia (Appwrite)
 * @param {string} type                      Tipo de notificação
 * @param {Record<string, unknown>} [data]   Dados adicionais para o template
 */
export async function notifyAcademyOwner(academy, type, data = {}) {
  const message = buildMessage(type, academy, data);
  if (!message) {
    console.warn('[notify] tipo desconhecido:', type);
    return;
  }

  // Telefone do dono — campos candidatos (o campo criado na academia é "phone")
  const ownerPhone = String(
    academy?.owner_phone || academy?.phone || academy?.contact_phone || ''
  ).replace(/\D/g, '');

  const instanceId = String(
    academy?.zapster_instance_id || academy?.zapsterInstanceId || ''
  ).trim();

  if (!ownerPhone || ownerPhone.length < 10) {
    console.log('[notify] telefone do dono ausente — notificação não enviada:', {
      academyId: academy?.$id,
      type,
    });
    return;
  }

  if (!instanceId) {
    console.log('[notify] zapster_instance_id ausente — notificação não enviada:', {
      academyId: academy?.$id,
      type,
    });
    return;
  }

  const result = await sendZapsterText({ recipient: ownerPhone, text: message, instanceId });

  if (result?.ok) {
    console.log('[notify] ✅ notificação enviada:', { academyId: academy?.$id, type });
  } else {
    // best-effort: não re-lança
    console.error('[notify] ❌ falha ao enviar notificação:', {
      academyId: academy?.$id,
      type,
      erro: result?.erro,
    });
  }
}
