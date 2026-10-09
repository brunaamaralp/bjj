import React, { useEffect, useState } from 'react';
import { PackagePlus, Wrench, ArrowUpFromLine, ArrowDownToLine, Scissors } from 'lucide-react';
import { Query } from 'appwrite';
import { databases, DB_ID, STOCK_ITEMS_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import EmptyState from '../shared/EmptyState.jsx';

const MOVE_TYPES = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'saida_venda', label: 'Saída (venda)' },
  { value: 'saida_aluguel', label: 'Saída (uso interno)' },
  { value: 'devolucao', label: 'Devolução' },
  { value: 'reversao_venda', label: 'Reversão de venda' },
  { value: 'avulso', label: 'Avulso' },
];

export default function InventoryMovesForm({
  initialItemId = '',
  initialTipo = 'entrada',
  modulesFinance,
  onSuccess,
  inventoryMove,
  loading,
  lastResult,
  error,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const [form, setForm] = useState({
    item_estoque_id: initialItemId,
    tipo: initialTipo,
    quantidade: 1,
    motivo: '',
    status_par: 'completo',
    purchase_price: '',
    payment_method: 'pix',
  });
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    if (initialItemId) setForm((f) => ({ ...f, item_estoque_id: initialItemId }));
  }, [initialItemId]);

  useEffect(() => {
    if (initialTipo) setForm((f) => ({ ...f, tipo: initialTipo }));
  }, [initialTipo]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let active = true;
    const run = async () => {
      const t = String(searchText || '').trim();
      if (t.length < 2 || !DB_ID || !STOCK_ITEMS_COL) {
        if (active) setSuggestions([]);
        return;
      }
      setSearchBusy(true);
      try {
        let docs = [];
        const baseQueries = [Query.limit(8)];
        if (academyId) {
          try {
            baseQueries.unshift(Query.equal('academy_id', academyId));
          } catch {
            void 0;
          }
        }
        try {
          const res = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
            ...baseQueries,
            Query.search('nome', t),
          ]);
          docs = res.documents;
        } catch {
          try {
            const res2 = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
              ...baseQueries,
              Query.search('descricao', t),
            ]);
            docs = res2.documents;
          } catch {
            docs = [];
          }
        }
        if (!active) return;
        setSuggestions(
          docs.map((d) => ({
            id: d.$id,
            nome: d.nome || d.descricao || d.name || d.$id,
          }))
        );
      } finally {
        if (active) setSearchBusy(false);
      }
    };
    const h = setTimeout(run, 300);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [searchText, academyId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.item_estoque_id) {
      addToast({ type: 'error', message: 'Selecione um item' });
      return;
    }
    if (!Number.isFinite(Number(form.quantidade)) || Number(form.quantidade) === 0) {
      addToast({ type: 'error', message: 'Quantidade inválida' });
      return;
    }
    const payload = {
      item_estoque_id: form.item_estoque_id,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      motivo: form.tipo === 'ajuste' ? form.motivo : undefined,
      status_par: form.tipo === 'avulso' ? form.status_par : undefined,
    };
    if (form.tipo === 'entrada' && form.purchase_price !== '' && modulesFinance) {
      const price = Number(form.purchase_price);
      if (Number.isFinite(price) && price > 0) {
        payload.purchase_price = price;
        payload.payment_method = form.payment_method;
      }
    }
    const result = await inventoryMove(payload);
    if (!result) {
      addToast({ type: 'error', message: error || 'Erro na movimentação' });
      return;
    }
    addToast({
      type: 'success',
      message: result.financial_tx_id
        ? 'Movimentação e despesa no Caixa registradas'
        : 'Movimentação aplicada',
    });
    if (onSuccess) onSuccess(result);
  };

  return (
    <form className="card mt-4 animate-in" onSubmit={submit}>
      <h3 className="navi-section-heading mb-2">Movimentação</h3>

      <div className="form-group">
        <label>Buscar item</label>
        <input
          className="form-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Nome do item"
        />
        {suggestions.length > 0 && (
          <div className="inventory-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="inventory-suggestion"
                onClick={() => {
                  setField('item_estoque_id', s.id);
                  setSuggestions([]);
                  setSearchText('');
                }}
              >
                {s.nome}
              </button>
            ))}
          </div>
        )}
        {searchBusy && <p className="text-xs text-muted" style={{ marginTop: 4 }}>Buscando…</p>}
      </div>

      <div className="form-group mt-2">
        <label>ID do item</label>
        <input
          className="form-input"
          value={form.item_estoque_id}
          onChange={(e) => setField('item_estoque_id', e.target.value)}
          placeholder="ID do item de estoque"
        />
      </div>

      <div className="flex gap-2 mt-2">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Tipo</label>
          <select className="form-input" value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
            {MOVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Quantidade</label>
          <input
            type="number"
            className="form-input"
            value={form.quantidade}
            onChange={(e) => setField('quantidade', e.target.value)}
          />
        </div>
      </div>

      {form.tipo === 'ajuste' && (
        <div className="form-group mt-2">
          <label>Motivo (obrigatório)</label>
          <input
            className="form-input"
            value={form.motivo}
            onChange={(e) => setField('motivo', e.target.value)}
            placeholder="Ex.: conferência física, perda, correção"
          />
        </div>
      )}

      {form.tipo === 'entrada' && modulesFinance && (
        <div className="card mt-2" style={{ padding: 12, border: '1px dashed var(--border-light)' }}>
          <p className="text-xs text-muted mb-2">Opcional: registrar compra no Caixa</p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 140px', margin: 0 }}>
              <label>Valor total pago (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="form-input"
                value={form.purchase_price}
                onChange={(e) => setField('purchase_price', e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
              <label>Forma de pagamento</label>
              <select
                className="form-input"
                value={form.payment_method}
                onChange={(e) => setField('payment_method', e.target.value)}
              >
                <option value="pix">PIX</option>
                <option value="debito">Débito</option>
                <option value="credito_avista">Crédito à vista</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {form.tipo === 'avulso' && (
        <div className="form-group mt-2">
          <label>Status do par</label>
          <select className="form-input" value={form.status_par} onChange={(e) => setField('status_par', e.target.value)}>
            <option value="completo">Completo</option>
            <option value="avulso_cima">Avulso (parte superior)</option>
            <option value="avulso_calca">Avulso (parte inferior)</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn-secondary" disabled={loading}>
          {form.tipo === 'entrada' && <PackagePlus size={16} />}
          {form.tipo === 'ajuste' && <Wrench size={16} />}
          {(form.tipo === 'saida_venda' || form.tipo === 'saida_aluguel') && <ArrowUpFromLine size={16} />}
          {form.tipo === 'devolucao' && <ArrowDownToLine size={16} />}
          {form.tipo === 'avulso' && <Scissors size={16} />}
          <span style={{ marginLeft: 6 }}>{loading ? 'Aplicando…' : 'Aplicar'}</span>
        </button>
      </div>

      {error && <p className="text-small mt-2" style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      {lastResult?.saldos && (
        <div className="text-small mt-2">
          <div><strong>Saldo atual:</strong> {lastResult.saldos.current_quantity}</div>
          <div><strong>Disponível (legado):</strong> {lastResult.saldos.disponivel}</div>
        </div>
      )}

      {!form.item_estoque_id && !searchText && (
        <EmptyState variant="compact" tone="dashed" title="Busque um item para movimentar" className="mt-3" />
      )}

    </form>
  );
}
