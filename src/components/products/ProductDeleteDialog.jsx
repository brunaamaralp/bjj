import React from 'react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

/**
 * Confirmação de exclusão ou desativação de produto (catálogo + estoque).
 */
export default function ProductDeleteDialog({
  open,
  product,
  hasSales,
  loading,
  onClose,
  onConfirmDelete,
  onConfirmDeactivate,
}) {
  if (!open || !product) return null;

  const qty = Number(product.current_quantity) || 0;

  if (hasSales) {
    return (
      <ConfirmDialog
        open={open}
        title="Desativar produto"
        description="Este produto tem vendas registradas e não pode ser excluído. Desativá-lo remove do catálogo de vendas mas mantém o histórico."
        confirmLabel="Desativar produto"
        cancelLabel="Cancelar"
        confirmVariant="warning"
        loading={loading}
        onClose={onClose}
        onConfirm={onConfirmDeactivate}
      />
    );
  }

  let description =
    'Este produto será removido do catálogo e do estoque. Esta ação não pode ser desfeita.';
  if (qty > 0) {
    description += ` Atenção: este produto tem ${qty} unidade${qty === 1 ? '' : 's'} em estoque.`;
  }

  return (
    <ConfirmDialog
      open={open}
      title="Excluir produto"
      description={description}
      confirmLabel="Excluir"
      cancelLabel="Cancelar"
      confirmVariant="danger"
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirmDelete}
    />
  );
}
