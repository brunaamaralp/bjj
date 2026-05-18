import React, { useMemo, useState } from 'react';
import { PackagePlus, ClipboardCheck, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { STOCK_STATUS_LABELS } from '../../lib/stockInventory';
import EmptyState from '../shared/EmptyState.jsx';

const STATUS_STYLES = {
  ok: { color: 'var(--success)', Icon: CheckCircle2, label: STOCK_STATUS_LABELS.ok },
  attention: { color: 'var(--warning, #c9a227)', Icon: AlertTriangle, label: STOCK_STATUS_LABELS.attention },
  critical: { color: 'var(--danger)', Icon: AlertTriangle, label: STOCK_STATUS_LABELS.critical },
};

export default function InventoryBalanceView({
  items,
  loading,
  onRefresh,
  onRegisterEntry,
  onCheckItem,
  onConfigureItem,
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const c = String(it.categoria || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && String(it.categoria || '') !== categoryFilter) return false;
      return true;
    });
  }, [items, statusFilter, categoryFilter]);

  return (
    <section className="mt-4 animate-in">
      <div className="flex justify-between items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <h2 className="navi-section-heading" style={{ margin: 0 }}>Saldo atual</h2>
        <button type="button" className="btn-outline btn-sm" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="attention">Atenção</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="text-xs">Categoria</label>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            title={items.length === 0 ? 'Nenhum item cadastrado' : 'Nenhum item neste filtro'}
            description="Cadastre itens no estoque ou ajuste os filtros."
            role="status"
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="navi-table" style={{ width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Item</th>
                  <th>Categoria</th>
                  <th>Unidade</th>
                  <th>Saldo</th>
                  <th>Mín.</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const st = STATUS_STYLES[it.status] || STATUS_STYLES.ok;
                  const StIcon = st.Icon;
                  return (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 600 }}>{it.nome}</td>
                      <td className="text-small text-muted">{it.categoria || '—'}</td>
                      <td className="text-small">{it.unit}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{it.current_quantity}</td>
                      <td className="text-small text-muted">{it.minimum_level > 0 ? it.minimum_level : '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: st.color, fontSize: 12, fontWeight: 600 }}>
                          <StIcon size={14} aria-hidden />
                          {st.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button type="button" className="btn-outline btn-sm" onClick={() => onRegisterEntry(it)} title="Registrar entrada">
                            <PackagePlus size={14} aria-hidden />
                          </button>
                          <button type="button" className="btn-outline btn-sm" onClick={() => void onCheckItem(it)} title="Conferir item">
                            <ClipboardCheck size={14} aria-hidden />
                          </button>
                          {onConfigureItem ? (
                            <button type="button" className="btn-outline btn-sm" onClick={() => onConfigureItem(it)} title="Nível mínimo e unidade">
                              <Settings2 size={14} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
