import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useInventoryStore } from '../store/useInventoryStore';
import { useProductsStore } from '../store/useProductsStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { refreshStockStores } from '../lib/syncStockStores';
import InventoryBalanceView from '../components/inventory/InventoryBalanceView';
import InventoryMovesForm from '../components/inventory/InventoryMovesForm';
import InventoryConfigureModal from '../components/inventory/InventoryConfigureModal';
import InventoryEntryModal from '../components/inventory/InventoryEntryModal';
import InventoryCheckModal from '../components/inventory/InventoryCheckModal';
import ProductDeleteDialog from '../components/products/ProductDeleteDialog';

const Inventory = () => {
  const [searchParams] = useSearchParams();
  const highlightItemId = searchParams.get('item') || '';
  const modules = useLeadStore((s) => s.modules);
  const { items, loadItems, inventoryMove, checkItem, updateItem, lastResult, loading, error } = useInventoryStore();
  const { checkDeleteProduct, deleteProduct, deactivateProduct } = useProductsStore();
  const [configItem, setConfigItem] = useState(null);
  const [entryItem, setEntryItem] = useState(null);
  const [checkTarget, setCheckTarget] = useState(null);
  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = useState('saldo');
  const [movePreset, setMovePreset] = useState({ itemId: '', tipo: 'entrada' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteHasSales, setDeleteHasSales] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    await loadItems();
  }, [loadItems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegisterEntry = (item) => {
    setEntryItem(item);
  };

  const submitEntry = async (payload) => {
    const result = await inventoryMove(payload);
    if (!result) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro na entrada' });
      return;
    }
    addToast({
      type: 'success',
      message: result.financial_tx_id
        ? 'Entrada e despesa no Caixa registradas'
        : 'Entrada registrada',
    });
    setEntryItem(null);
    await refreshStockStores();
  };

  const confirmCheck = async () => {
    if (!checkTarget) return;
    const out = await checkItem(checkTarget.id);
    if (!out) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro na conferência' });
      return;
    }
    addToast({ type: 'success', message: `Conferência registrada para ${checkTarget.nome}` });
    setCheckTarget(null);
    await refresh();
  };

  const onMoveSuccess = async () => {
    await refreshStockStores();
  };

  const saveConfigure = async (form) => {
    if (!configItem) return;
    const updated = await updateItem({
      item_estoque_id: configItem.id,
      minimum_level: form.minimum_level,
      unit: form.unit,
      notes: form.notes,
    });
    if (!updated) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro ao salvar' });
      return;
    }
    addToast({ type: 'success', message: 'Item atualizado' });
    setConfigItem(null);
    await refreshStockStores();
  };

  const openDeleteDialog = async (item) => {
    setDeleteBusy(true);
    setDeleteTarget(item);
    const check = await checkDeleteProduct(item.id);
    setDeleteBusy(false);
    if (!check) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao verificar item' });
      setDeleteTarget(null);
      return;
    }
    setDeleteHasSales(check.has_sales);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteHasSales(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const ok = await deleteProduct(deleteTarget.id);
    setDeleteBusy(false);
    if (!ok) {
      const err = useProductsStore.getState().error || '';
      if (/vendas registradas/i.test(err)) {
        setDeleteHasSales(true);
        return;
      }
      addToast({ type: 'error', message: err || 'Erro ao excluir item' });
      return;
    }
    addToast({ type: 'success', message: 'Item excluído' });
    closeDeleteDialog();
    await refreshStockStores();
  };

  const handleDeactivateFromDelete = async (itemId) => {
    const updated = await deactivateProduct(itemId);
    if (!updated) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao desativar' });
      return;
    }
    addToast({ type: 'success', message: 'Produto desativado' });
    closeDeleteDialog();
    await refreshStockStores();
  };

  if (modules?.inventory !== true) {
    return null;
  }

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Estoque</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 12 }}>
          Saldo por item e movimentações
        </p>
        <div className="page-header-card" style={{ marginBottom: 16 }}>
          <div className="page-header-row">
            <div style={{ flex: 1 }} />
            <Link to="/loja?tab=produtos&import=1" className="btn-action-primary">
              <Upload size={14} aria-hidden />
              Importar produtos em lote
            </Link>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3" role="tablist">
        <button
          type="button"
          className={tab === 'saldo' ? 'btn-secondary' : 'btn-outline'}
          onClick={() => setTab('saldo')}
        >
          Inventário
        </button>
        <button
          type="button"
          className={tab === 'movimentos' ? 'btn-secondary' : 'btn-outline'}
          onClick={() => setTab('movimentos')}
        >
          Movimentações
        </button>
      </div>

      {tab === 'saldo' ? (
        <InventoryBalanceView
          items={items}
          loading={loading}
          highlightItemId={highlightItemId}
          onRefresh={refresh}
          onRegisterEntry={handleRegisterEntry}
          onRequestCheck={(item) => setCheckTarget(item)}
          onConfigureItem={(item) => setConfigItem(item)}
          onDeleteItem={(item) => void openDeleteDialog(item)}
          deleteBusyId={deleteBusy ? deleteTarget?.id : null}
        />
      ) : (
        <InventoryMovesForm
          key={`${movePreset.itemId}-${movePreset.tipo}`}
          initialItemId={movePreset.itemId}
          initialTipo={movePreset.tipo}
          modulesFinance={modules?.finance === true}
          inventoryMove={inventoryMove}
          loading={loading}
          lastResult={lastResult}
          error={error}
          onSuccess={onMoveSuccess}
        />
      )}

      <ProductDeleteDialog
        open={deleteDialogOpen}
        product={deleteTarget}
        hasSales={deleteHasSales}
        loading={deleteBusy || loading}
        onClose={closeDeleteDialog}
        onConfirmDelete={() => void confirmDelete()}
        onConfirmDeactivate={() => deleteTarget && void handleDeactivateFromDelete(deleteTarget.id)}
      />

      <InventoryConfigureModal
        open={Boolean(configItem)}
        item={configItem}
        loading={loading}
        onClose={() => setConfigItem(null)}
        onSave={saveConfigure}
      />

      <InventoryEntryModal
        open={Boolean(entryItem)}
        item={entryItem}
        loading={loading}
        modulesFinance={modules?.finance === true}
        onClose={() => setEntryItem(null)}
        onSubmit={submitEntry}
      />

      <InventoryCheckModal
        open={Boolean(checkTarget)}
        item={checkTarget}
        loading={loading}
        onClose={() => setCheckTarget(null)}
        onConfirm={() => void confirmCheck()}
      />
    </div>
  );
};

export default Inventory;
