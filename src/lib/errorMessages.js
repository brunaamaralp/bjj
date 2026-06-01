/**
 * Converte erros técnicos em mensagens amigáveis.
 * Nunca expor e.message diretamente ao usuário.
 */

import { describeAppwriteError } from './appwriteErrors.js';

const ERROR_MAP = {
  // Appwrite
  'Document with the requested ID could not be found':
    'Registro não encontrado. Recarregue a página.',
  'Collection with the requested ID could not be found':
    'Serviço temporariamente indisponível.',
  'Invalid document structure':
    'Dados inválidos. Verifique as informações.',
  'Unknown attribute':
    'Campo não configurado no Appwrite. Execute npm run provision:academy-attrs (academias) ou provision:task-templates.',
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

  // Auth
  'Invalid credentials':
    'Email ou senha incorretos.',
  'already exists':
    'Este email já está cadastrado.',
  'Rate limit':
    'Muitas tentativas. Aguarde alguns segundos.',
  '429':
    'Muitas tentativas. Aguarde alguns segundos.',

  // Rede
  'Failed to fetch':
    'Sem conexão. Verifique sua internet.',
  'fetch failed':
    'Sem conexão. Verifique sua internet e tente novamente.',
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
  sale:    'Não foi possível registrar a venda. Tente novamente.',
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

  const appwriteSpecific = describeAppwriteError(err);
  if (appwriteSpecific) return appwriteSpecific;

  // Verificar mapeamento exato
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) {
      return friendly;
    }
  }

  // Fallback por contexto
  return DEFAULT_ERRORS[context] ?? DEFAULT_ERRORS.action;
}

const SALE_ERROR_CODES = {
  no_stock: 'Produto sem estoque disponível.',
  stock_stale: 'Estoque atualizado. Verifique as quantidades.',
  session_required: 'Sessão expirada. Faça login novamente.',
  academy_required: 'Academia não selecionada. Recarregue a página.',
  invalid_items: 'Um ou mais itens estão inválidos.',
  item_not_found: 'Produto não encontrado. Atualize o catálogo e tente de novo.',
  parent_not_variant: 'Selecione o tamanho do produto antes de concluir a venda.',
  duplicate_sale: 'Esta venda já foi registrada.',
  create_failed: 'Não foi possível registrar a venda. Revise as informações e tente novamente.',
  server_error: 'Não foi possível registrar a venda. Tente novamente.',
  error_500: 'Não foi possível registrar a venda. Tente novamente em instantes.',
  sales_not_configured: 'Vendas não configuradas no servidor. Contate o suporte.',
};

/**
 * Mensagens amigáveis para erros de venda (códigos da API / SalesApiError).
 */
export function friendlySaleError(err) {
  if (!err) return null;
  const code =
    typeof err === 'string'
      ? err.trim()
      : String(err?.code || err?.message || '').trim();
  if (code && SALE_ERROR_CODES[code]) return SALE_ERROR_CODES[code];
  const bodyCode = String(err?.body?.error || err?.body?.erro || '').trim();
  if (bodyCode && SALE_ERROR_CODES[bodyCode]) return SALE_ERROR_CODES[bodyCode];
  return friendlyError(err, 'sale');
}
