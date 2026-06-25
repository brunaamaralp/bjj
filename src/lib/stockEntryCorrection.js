const MESSAGES = {
  forbidden: 'Apenas titular ou administrador pode corrigir entradas com valor no Caixa.',
  only_entrada: 'Só é possível corrigir movimentações do tipo entrada.',
  not_found: 'Movimentação não encontrada.',
  invalid_correction: 'Tipo de correção inválido.',
  new_quantity_required: 'Informe a quantidade correta da entrada.',
  invalid_quantity: 'Quantidade inválida.',
  finance_correction_required: 'Informe o valor correto ou estorne a despesa existente no Caixa.',
  already_reversed: 'Esta despesa já foi estornada. Ajuste o estoque se ainda necessário.',
  already_cancelled: 'A despesa no Caixa já está cancelada.',
  only_settled_can_reverse: 'Só é possível estornar despesas liquidadas.',
  pending_tx_use_cancel: 'Despesa pendente: cancele em Financeiro → Movimentações.',
  adjust_failed: 'Não foi possível ajustar o estoque.',
  no_stock: 'Saldo insuficiente para esta correção.',
  correction_failed: 'Não foi possível concluir a correção.',
};

export function stockEntryCorrectionError(code, partial) {
  const key = String(code || '').trim().toLowerCase();
  const base = MESSAGES[key] || String(code || MESSAGES.correction_failed);
  if (partial) {
    return `${base} Parte da correção foi aplicada — atualize a página e revise estoque e Caixa.`;
  }
  return base;
}

export const STOCK_ENTRY_CORRECTION_MODES = [
  { id: 'finance_only', label: 'Valor errado', description: 'Estorna a despesa no Caixa e registra o valor correto.' },
  { id: 'quantity_only', label: 'Quantidade errada', description: 'Ajusta o saldo sem alterar o Caixa (se já estiver certo).' },
  { id: 'both', label: 'Valor e quantidade', description: 'Estorna o Caixa e corrige o saldo em sequência.' },
];
