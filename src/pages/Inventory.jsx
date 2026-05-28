import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Upload } from 'lucide-react';
import StockSettingsSection from '../components/academy/StockSettingsSection.jsx';
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
import InventoryAdjustModal from '../components/inventory/InventoryAdjustModal';
import { formatAdjustToast } from '../lib/inventoryAdjust';
import { mergeCatalogWithInventoryItems } from '../lib/inventoryCatalogMerge.js';
const Inventory = () => {
  const [searchParams] = useSearchParams();
  const highlightItemId = searchParams.get('item') || '';
  const modules = useLeadStore((s) => s.modules);
  const academyId = useLeadStore((s) => s.academyId);
  const [stockConfigOpen, setStockConfigOpen] = useState(false);
  const items = useInventoryStore((s) => s.items);
  const loadItems = useInventoryStore((s) => s.loadItems);
  const inventoryMove = useInventoryStore((s) => s.inventoryMove);
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const checkItem = useInventoryStore((s) => s.checkItem);
  const updateItem = useInventoryStore((s) => s.updateItem);
  const lastResult = useInventoryStore((s) => s.lastResult);
  const loading = useInventoryStore((s) => s.loading);
  const error = useInventoryStore((s) => s.error);
  const loadProducts = useProductsStore((s) => s.loadProducts);
  const parentProducts = useProductsStore((s) => s.products);
  const [configItem, setConfigItem] = useState(null);
  const [entryItem, setEntryItem] = useState(null);
  const [checkTarget, setCheckTarget] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);

  const openAdjustItem = useCallback((item) => {
    requestAnimationFrame(() => setAdjustItem(item));
  }, []);

  const openConfigItem = useCallback((item) => {
    requestAnimationFrame(() => setConfigItem(item));
  }, []);

  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = useState('saldo');
  const [movePreset, setMovePreset] = useState({ itemId: '', tipo: 'entrada' });

  const refresh = useCallback(async () => {
    await Promise.all([loadItems(), loadProducts()]);
  }, [loadItems, loadProducts]);

  const itemsWithImages = useMemo(() => {
    const imageByParent = new Map(
      (parentProducts || []).map((p) => [String(p.id || '').trim(), String(p.image_url || '').trim()])
    );
    return (items || []).map((it) => {
      const pid = String(it.product_id || '').trim();
      const fallback = pid ? imageByParent.get(pid) : '';
      return {
        ...it,
        image_url: String(it.image_url || '').trim() || fallback || '',
      };
    });
  }, [items, parentProducts]);

  const catalogParents = useMemo(
    () => mergeCatalogWithInventoryItems(parentProducts, itemsWithImages),
    [parentProducts, itemsWithImages]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegisterEntry = (item) => {
    setEntryItem(item);
  };

  const submitAdjust = async (payload) => {
    const result = await adjustStock(payload);
    if (!result?.sucesso) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro no ajuste' });
      return;
    }
    const before = result.quantity_before ?? 0;
    const after = result.quantity_after ?? 0;
    addToast({ type: 'success', message: formatAdjustToast(before, after) });
    setAdjustItem(null);
    await refreshStockStores();
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

  if (modules?.inventory !== true) {
    return null;
  }

  return (
    <div className="container inventory-page" style={{ paddingTop: 16, paddingBottom: 12 }}>
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
          catalogParents={catalogParents}
          items={itemsWithImages}
          loading={loading}
          highlightItemId={highlightItemId}
          onRefresh={refresh}
          onRegisterEntry={handleRegisterEntry}
          onRequestCheck={(item) => setCheckTarget(item)}
          onConfigureItem={openConfigItem}
          onAdjustItem={openAdjustItem}
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

      <InventoryAdjustModal
        open={Boolean(adjustItem)}
        item={adjustItem}
        loading={loading}
        onClose={() => setAdjustItem(null)}
        onSubmit={submitAdjust}
      />

      {academyId ? (
        <div className="mt-4" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setStockConfigOpen((v) => !v)}
            aria-expanded={stockConfigOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            Configurações de estoque
            {stockConfigOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
          {stockConfigOpen ? (
            <div className="mt-3 animate-in">
              <StockSettingsSection academyId={academyId} modules={modules} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default Inventory;
