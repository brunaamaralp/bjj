/**
 * Converte erros técnicos em mensagens amigáveis.
 * Nunca expor e.message diretamente ao usuário.
 */

import { describeAppwriteError, getAppwriteDevHint } from './appwriteErrors.js';

const ERROR_MAP = {
  // Appwrite
  'Document with the requested ID could not be found':
    'Registro não encontrado. Recarregue a página.',
  'Collection with the requested ID could not be found':
    'Serviço temporariamente indisponível. Tente novamente em instantes.',
  'Invalid document structure':
    'Dados inválidos. Verifique as informações e tente novamente.',
  'Unknown attribute':
    'Não foi possível salvar porque alguns dados ainda não estão disponíveis. Tente novamente ou fale com o suporte.',
  'Missing required attribute':
    'Preencha todos os campos obrigatórios.',
  'create_document_schema_incompatible':
    'Não foi possível salvar porque alguns dados ainda não estão disponíveis. Tente novamente ou fale com o suporte.',
  'update_document_schema_incompatible':
    'Não foi possível salvar porque alguns dados ainda não estão disponíveis. Tente novamente ou fale com o suporte.',

  // Sessão / academia
  session_required: 'Sessão expirada. Faça login novamente.',
  academy_required: 'Academia não selecionada. Recarregue a página.',
  academy_missing: 'Academia não selecionada. Recarregue a página.',
  jwt_missing: 'Sessão expirada. Faça login novamente.',
  user_missing: 'Usuário não identificado. Recarregue a página.',

  // Zapster
  instance_not_found: 'WhatsApp desconectado. Verifique a página Agente IA.',
  instance_not_connected: 'WhatsApp sem sinal. Reconecte o dispositivo.',

  phone_duplicate: 'Este telefone já está cadastrado como aluno ativo.',
  phone_duplicate_active: 'Este telefone já está cadastrado como aluno ativo.',

  // Auth
  'Invalid credentials': 'Email ou senha incorretos.',
  'already exists': 'Este email já está cadastrado.',
  'Rate limit': 'Muitas tentativas. Aguarde alguns segundos.',
  '401': 'Sessão expirada. Recarregue a página.',
  unauthorized: 'Sem permissão para esta ação.',
  '429': 'Muitas tentativas. Aguarde alguns segundos.',

  // Rede
  'Failed to fetch': 'Sem conexão. Verifique sua internet.',
  'fetch failed': 'Sem conexão. Verifique sua internet e tente novamente.',
  NetworkError: 'Sem conexão. Verifique sua internet.',
  AbortError: 'A operação demorou muito. Tente novamente.',
  timeout: 'Servidor demorou para responder. Tente novamente.',
  error_500: 'Algo deu errado no servidor. Tente novamente em instantes.',
  error_404: 'Recurso não encontrado. Recarregue a página.',
  'HTTP 500': 'Algo deu errado no servidor. Tente novamente em instantes.',
  'HTTP 502': 'Serviço temporariamente indisponível. Tente novamente.',
  'HTTP 503': 'Serviço temporariamente indisponível. Tente novamente.',

  // Anthropic / agente IA
  rate_limit_exceeded: 'Serviço temporariamente sobrecarregado. Aguarde.',
  context_length_exceeded: 'Conversa muito longa. Inicie um novo atendimento.',
  prompt_nao_configurado: 'Configure o assistente na configuração guiada antes de testar.',
  limite_diario: 'Limite diário de testes atingido. Tente novamente amanhã.',
  upstream_error: 'Erro no assistente. Tente novamente ou fale com o suporte.',
  ANTHROPIC_API_KEY: 'Serviço de IA temporariamente indisponível. Fale com o suporte.',
  'ANTHROPIC_API_KEY não configurado': 'Serviço de IA temporariamente indisponível. Fale com o suporte.',

  // Contratos / permissões
  owner_required: 'Apenas o titular da academia pode fazer esta alteração.',
  autentique_not_configured: 'Integração com assinatura digital não configurada. Fale com o suporte.',

  // Zapster / WhatsApp
  zapster_timeout: 'WhatsApp demorou para responder. Tente novamente em instantes.',
  ZAPSTER_TOKEN_MISSING: 'WhatsApp não configurado no servidor. Fale com o suporte.',

  // Genéricos de API
  internal: 'Ação não concluída. Tente novamente.',
  server_error: 'Algo deu errado. Tente novamente ou fale com o suporte.',
  summary_failed: 'Não foi possível carregar o resumo financeiro. Tente novamente.',
  forecast_failed: 'Não foi possível carregar a previsão. Tente novamente.',
  bank_balances_failed: 'Não foi possível carregar os saldos das contas. Tente novamente.',
  receivables_failed: 'Não foi possível carregar as contas a receber. Tente novamente.',
  reconcile_failed: 'Não foi possível verificar os lançamentos. Tente novamente.',
};

const FINANCE_TX_CODES = {
  cannot_settle_cancelled: 'Não é possível liquidar um lançamento cancelado.',
  cannot_cancel_settled: 'Não é possível cancelar um lançamento já liquidado.',
  already_cancelled: 'Este lançamento já está cancelado.',
  already_settled: 'Este lançamento já foi liquidado.',
  only_settled_can_reverse: 'Só é possível estornar lançamentos liquidados.',
  already_reversed: 'Este lançamento já foi estornado.',
  cannot_reverse_reversal: 'Não é possível estornar um lançamento de estorno.',
  cannot_reverse_recurrence_template: 'Não é possível estornar o modelo de recorrência.',
  only_settled_can_assign_bank: 'Só é possível atribuir conta em lançamentos liquidados.',
  create_failed: 'Não foi possível criar o lançamento. Tente novamente.',
  save_failed: 'Não foi possível salvar o lançamento. Tente novamente.',
  snapshot_mismatch: 'Os valores mudaram desde a última visualização. Recarregue e tente de novo.',
  duplicate_payment: 'Já existe um lançamento com este valor e data para este aluno.',
};

const DEFAULT_ERRORS = {
  save: 'Não foi possível salvar. Tente novamente.',
  load: 'Não foi possível carregar. Recarregue a página.',
  delete: 'Não foi possível excluir. Tente novamente.',
  send: 'Não foi possível enviar. Tente novamente.',
  action: 'Ação não concluída. Tente novamente.',
  sale: 'Não foi possível registrar a venda. Tente novamente.',
  network: 'Problema de conexão. Verifique sua internet.',
  download: 'Não foi possível baixar o arquivo. Tente novamente.',
};

function extractRawMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err.trim();
  const parts = [err.message, err.erro, err.error, err.code, err.detail]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return parts[0] || String(err);
}

function logTechnicalError(err, friendly, raw) {
  if (typeof console === 'undefined') return;
  const devHint = getAppwriteDevHint(err);
  if (devHint || (raw && friendly && raw !== friendly)) {
    console.warn('[friendlyError]', { friendly, raw, devHint });
  }
}

/**
 * Uso:
 * import { friendlyError } from '../lib/errorMessages';
 *
 * } catch (e) {
 *   addToast(friendlyError(e, 'save'), 'error');
 * }
 */
export function friendlyError(err, context = 'action') {
  const raw = extractRawMessage(err);
  const errObj = typeof err === 'object' && err !== null ? err : { message: raw };

  const appwriteSpecific = describeAppwriteError(errObj);
  if (appwriteSpecific) {
    logTechnicalError(errObj, appwriteSpecific, raw);
    return appwriteSpecific;
  }

  if (raw.startsWith('phone_duplicate_active:')) {
    const name = raw.slice('phone_duplicate_active:'.length).trim();
    const friendly = name
      ? `Este telefone já está cadastrado — ${name}`
      : ERROR_MAP.phone_duplicate;
    logTechnicalError(errObj, friendly, raw);
    return friendly;
  }

  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) {
      logTechnicalError(errObj, friendly, raw);
      return friendly;
    }
  }

  const fallback = DEFAULT_ERRORS[context] ?? DEFAULT_ERRORS.action;
  logTechnicalError(errObj, fallback, raw);
  return fallback;
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
  sales_not_configured: 'Vendas não configuradas. Fale com o suporte.',
  shift_required: 'Abra o caixa antes de registrar vendas.',
  due_date_required: 'Informe a data de vencimento da venda a prazo.',
  cash_shift_not_configured: 'Turno de caixa não configurado. Execute o script de provisionamento.',
};

/**
 * Mensagens amigáveis para erros de venda (códigos da API / SalesApiError).
 */
/** Códigos de erro da API finance-tx (campo `error` no JSON). */
export function financeTxFriendlyError(codeOrErr, context = 'action') {
  const code = String(
    typeof codeOrErr === 'string' ? codeOrErr : codeOrErr?.message || codeOrErr?.code || ''
  ).trim();
  if (code && FINANCE_TX_CODES[code]) return FINANCE_TX_CODES[code];
  if (/já existe um lançamento/i.test(code)) return FINANCE_TX_CODES.duplicate_payment;
  return friendlyError(codeOrErr, context);
}

export function friendlySaleError(err) {
  if (!err) return null;
  const code =
    typeof err === 'string'
      ? err.trim()
      : String(err?.code || err?.message || '').trim();
  if (code && SALE_ERROR_CODES[code]) {
    return SALE_ERROR_CODES[code];
  }
  const bodyCode = String(err?.body?.error || err?.body?.erro || '').trim();
  if (bodyCode && SALE_ERROR_CODES[bodyCode]) return SALE_ERROR_CODES[bodyCode];
  return friendlyError(err, 'sale');
}
