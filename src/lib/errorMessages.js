/**
 * Converte erros técnicos em mensagens amigáveis.
 * Nunca expor e.message diretamente ao usuário.
 */

const ERROR_MAP = {
  // Appwrite
  'Document with the requested ID could not be found':
    'Registro não encontrado. Recarregue a página.',
  'Collection with the requested ID could not be found':
    'Serviço temporariamente indisponível.',
  'Invalid document structure':
    'Dados inválidos. Verifique as informações.',
  'Missing required attribute':
    'Preencha todos os campos obrigatórios.',

  // Zapster
  'instance_not_found':
    'WhatsApp desconectado. Verifique a página Agente IA.',
  'instance_not_connected':
    'WhatsApp sem sinal. Reconecte o dispositivo.',
  '401':
    'Sessão expirada. Recarregue a página.',
  'unauthorized':
    'Sem permissão para esta ação.',

  // Rede
  'Failed to fetch':
    'Sem conexão. Verifique sua internet.',
  'NetworkError':
    'Sem conexão. Verifique sua internet.',
  'AbortError':
    'A operação demorou muito. Tente novamente.',
  'timeout':
    'Servidor demorou para responder. Tente novamente.',

  // Anthropic
  'rate_limit_exceeded':
    'Serviço temporariamente sobrecarregado. Aguarde.',
  'context_length_exceeded':
    'Conversa muito longa. Inicie um novo atendimento.',
};

const DEFAULT_ERRORS = {
  save:    'Não foi possível salvar. Tente novamente.',
  load:    'Não foi possível carregar. Recarregue a página.',
  delete:  'Não foi possível excluir. Tente novamente.',
  send:    'Não foi possível enviar. Tente novamente.',
  action:  'Ação não concluída. Tente novamente.',
  network: 'Problema de conexão. Verifique sua internet.',
};

/**
 * Uso:
 * import { friendlyError } from '../lib/errorMessages';
 *
 * } catch (e) {
 *   addToast(friendlyError(e, 'save'), 'error');
 * }
 */
export function friendlyError(err, context = 'action') {
  const msg = err?.message ?? String(err ?? '');

  // Verificar mapeamento exato
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) {
      return friendly;
    }
  }

  // Fallback por contexto
  return DEFAULT_ERRORS[context] ?? DEFAULT_ERRORS.action;
}
