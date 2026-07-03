import '../styles/sales.css';
import '../styles/inventory-page.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload, Settings } from 'lucide-react';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import StockSettingsSection from '../components/academy/StockSettingsSection.jsx';
import { useInventoryStore } from '../store/useInventoryStore';
import { useProductsStore } from '../store/useProductsStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { refreshStockStores } from '../lib/syncStockStores';
import InventoryBalanceView from '../components/inventory/InventoryBalanceView';
import InventoryMovesPanel from '../components/inventory/InventoryMovesPanel';
import InventoryConfigureModal from '../components/inventory/InventoryConfigureModal';
import InventoryEntryModal from '../components/inventory/InventoryEntryModal';
import InventoryCheckModal from '../components/inventory/InventoryCheckModal';
import InventoryAdjustModal from '../components/inventory/InventoryAdjustModal';
import { formatAdjustToast } from '../lib/inventoryAdjust';
import { mergeCatalogWithInventoryItems } from '../lib/inventoryCatalogMerge.js';
import { lojaEstoqueTabParams, resolveInventorySubtab } from '../lib/lojaInventoryTabs.js';
import { useUserRole } from '../lib/useUserRole.js';
const Inventory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightItemId = searchParams.get('item') || '';
  const highlightMoveId = searchParams.get('move') || '';
  const modules = useLeadStore((s) => s.modules);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const navRole = useUserRole(academyDoc);
  const canCorrectEntry = navRole === 'owner' || navRole === 'admin';
  const [stockConfigOpen, setStockConfigOpen] = useState(false);
  const stockConfigRef = useRef(null);
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
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [movesPanelTab, setMovesPanelTab] = useState('historico');

  const openAdjustItem = useCallback((item) => {
    requestAnimationFrame(() => setAdjustItem(item));
  }, []);

  const openConfigItem = useCallback((item) => {
    requestAnimationFrame(() => setConfigItem(item));
  }, []);

  const addToast = useUiStore((s) => s.addToast);
  const tab = useMemo(() => resolveInventorySubtab(searchParams), [searchParams]);
  const movePreset = { itemId: '', tipo: 'entrada' };

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
    if (!academyId || tab !== 'saldo') return;
    void refresh();
  }, [academyId, tab, refresh]);

  const activeMovesPanelTab = highlightMoveId ? 'historico' : movesPanelTab;

  const handleRegisterEntry = (item) => {
    setEntryItem(item);
  };

  const submitAdjust = async (payload) => {
    setAdjustSaving(true);
    try {
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
    } finally {
      setAdjustSaving(false);
    }
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
    await useInventoryStore.getState().listMoves({});
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
    await useInventoryStore.getState().listMoves({});
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

  const inventoryTabs = useMemo(
    () => [
      { id: 'saldo', label: 'Inventário' },
      { id: 'movimentos', label: 'Movimentações' },
    ],
    []
  );

  if (modules?.inventory !== true) {
    return null;
  }

  const toggleStockConfig = () => {
    setStockConfigOpen((open) => {
      const next = !open;
      if (next) {
        window.setTimeout(() => {
          stockConfigRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
      return next;
    });
  };

  return (
    <div className="container inventory-page navi-hub-page">
      <div className="loja-subnav inventory-subnav">
        <HubTabBar
          tabs={inventoryTabs}
          activeId={tab}
          onChange={(id) => setSearchParams(lojaEstoqueTabParams(id, searchParams), { replace: false })}
          ariaLabel="Estoque"
          variant="underline"
          size="sm"
          className="loja-subnav__tabs inventory-page__tabs"
        />
        <div className="loja-subnav__actions inventory-page-actions">
          <button
            type="button"
            className={`btn-outline inventory-config-btn${stockConfigOpen ? ' inventory-config-btn--active' : ''}`}
            onClick={toggleStockConfig}
            aria-expanded={stockConfigOpen}
            aria-controls="stock-config-panel"
            title={stockConfigOpen ? 'Fechar configurações de estoque' : 'Configurações de estoque'}
          >
            <Settings size={14} aria-hidden />
            Configurações
          </button>
          <Link to="/loja?tab=produtos&import=1" className="btn-action-primary">
            <Upload size={14} aria-hidden />
            Importar em lote
          </Link>
        </div>
      </div>

      {academyId && stockConfigOpen ? (
        <div id="stock-config-panel" ref={stockConfigRef} className="inventory-config-panel animate-in">
          <StockSettingsSection
            academyId={academyId}
            modules={modules}
            onClose={() => setStockConfigOpen(false)}
          />
        </div>
      ) : null}

      <div className="inventory-page__body">
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
        <InventoryMovesPanel
          panelTab={activeMovesPanelTab}
          onPanelTabChange={setMovesPanelTab}
          highlightMoveId={highlightMoveId}
          modulesFinance={modules?.finance === true}
          canCorrectEntry={canCorrectEntry}
          moveFormProps={{
            key: `${movePreset.itemId}-${movePreset.tipo}`,
            initialItemId: movePreset.itemId,
            initialTipo: movePreset.tipo,
            modulesFinance: modules?.finance === true,
            inventoryMove,
            loading,
            lastResult,
            error,
            onSuccess: onMoveSuccess,
          }}
        />
      )}
      </div>

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
        loading={adjustSaving}
        onClose={() => setAdjustItem(null)}
        onSubmit={submitAdjust}
      />

    </div>
  );
};

export default Inventory;
