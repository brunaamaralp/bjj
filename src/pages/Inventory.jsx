import React, { useCallback, useEffect, useState } from 'react';
import { useInventoryStore } from '../store/useInventoryStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import InventoryBalanceView from '../components/inventory/InventoryBalanceView.jsx';
import InventoryMovesForm from '../components/inventory/InventoryMovesForm.jsx';

const Inventory = () => {
  const modules = useLeadStore((s) => s.modules);
  const { items, loadItems, inventoryMove, checkItem, updateItem, lastResult, loading, error } = useInventoryStore();
  const [configItem, setConfigItem] = useState(null);
  const [configForm, setConfigForm] = useState({ minimum_level: 0, unit: 'unidade', notes: '' });
  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = useState('saldo');
  const [movePreset, setMovePreset] = useState({ itemId: '', tipo: 'entrada' });

  const refresh = useCallback(async () => {
    await loadItems();
  }, [loadItems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegisterEntry = (item) => {
    setMovePreset({ itemId: item.id, tipo: 'entrada' });
    setTab('movimentos');
  };

  const handleCheckItem = async (item) => {
    const out = await checkItem(item.id);
    if (!out) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro na conferência' });
      return;
    }
    addToast({ type: 'success', message: `Conferência registrada para ${item.nome}` });
    await refresh();
  };

  const onMoveSuccess = async () => {
    await refresh();
  };

  const openConfigure = (item) => {
    setConfigItem(item);
    setConfigForm({
      minimum_level: item.minimum_level || 0,
      unit: item.unit || 'unidade',
      notes: item.notes || '',
    });
  };

  const saveConfigure = async () => {
    if (!configItem) return;
    const updated = await updateItem({
      item_estoque_id: configItem.id,
      minimum_level: Number(configForm.minimum_level) || 0,
      unit: configForm.unit,
      notes: configForm.notes,
    });
    if (!updated) {
      addToast({ type: 'error', message: useInventoryStore.getState().error || 'Erro ao salvar' });
      return;
    }
    addToast({ type: 'success', message: 'Item atualizado' });
    setConfigItem(null);
    await refresh();
  };

  if (modules?.inventory !== true) {
    return null;
  }

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Estoque</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>
          Saldo por item e movimentações
        </p>
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
          onRefresh={refresh}
          onRegisterEntry={handleRegisterEntry}
          onCheckItem={handleCheckItem}
          onConfigureItem={openConfigure}
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

      {configItem && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfigItem(null)}
        >
          <div
            className="card modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, margin: 'auto', marginTop: '10vh' }}
          >
            <h3 className="navi-section-heading">{configItem.nome}</h3>
            <div className="form-group mt-2">
              <label>Nível mínimo (0 = sem alerta)</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={configForm.minimum_level}
                onChange={(e) => setConfigForm((f) => ({ ...f, minimum_level: e.target.value }))}
              />
            </div>
            <div className="form-group mt-2">
              <label>Unidade</label>
              <input
                className="form-input"
                value={configForm.unit}
                onChange={(e) => setConfigForm((f) => ({ ...f, unit: e.target.value })}
                placeholder="unidade, pacote, kg…"
              />
            </div>
            <div className="form-group mt-2">
              <label>Observações</label>
              <textarea
                className="form-input"
                rows={2}
                value={configForm.notes}
                onChange={(e) => setConfigForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end mt-3">
              <button type="button" className="btn-outline" onClick={() => setConfigItem(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-secondary" onClick={() => void saveConfigure()} disabled={loading}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
