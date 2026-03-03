import React, { useState } from 'react';
import { useInventoryStore } from '../store/useInventoryStore';
import { PackagePlus, Wrench, ArrowDownToLine, ArrowUpFromLine, Scissors } from 'lucide-react';
import { KIMONO_SIZES, databases, DB_ID, STOCK_ITEMS_COL } from '../lib/appwrite';
import { Query } from 'appwrite';

const Inventory = () => {
  const { inventoryMove, lastResult, loading, error } = useInventoryStore();
  const [form, setForm] = useState({
    item_estoque_id: '',
    tipo: 'entrada',
    quantidade: 1,
    motivo: '',
    status_par: 'completo'
  });
  const [kimonoCat, setKimonoCat] = useState('adulto_unissex');
  const [kimonoSize, setKimonoSize] = useState(KIMONO_SIZES.adulto_unissex[0]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      item_estoque_id: form.item_estoque_id,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      motivo: form.tipo === 'ajuste' ? form.motivo : undefined,
      status_par: form.tipo === 'avulso' ? form.status_par : undefined
    };
    await inventoryMove(payload);
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Estoque</h1>
        <p className="text-small">Movimentações rápidas</p>
      </div>

      <form className="card mt-4 animate-in" onSubmit={submit}>
        <div className="form-group">
          <label>ID do Item de Estoque</label>
          <input className="form-input" value={form.item_estoque_id} onChange={(e) => setField('item_estoque_id', e.target.value)} placeholder="stock_item_id" />
        </div>

        <div className="form-group mt-2">
          <label>Atalho: Kimonos</label>
          <div className="flex gap-2">
            <select
              className="form-input"
              style={{ flex: 1 }}
              value={kimonoCat}
              onChange={(e) => {
                const cat = e.target.value;
                setKimonoCat(cat);
                const first = KIMONO_SIZES[cat]?.[0] || '';
                setKimonoSize(first);
              }}
            >
              <option value="adulto_unissex">Adulto / Unissex</option>
              <option value="feminino">Feminino</option>
              <option value="infantil">Infantil</option>
            </select>
            <select
              className="form-input"
              style={{ flex: 1 }}
              value={kimonoSize}
              onChange={(e) => setKimonoSize(e.target.value)}
            >
              {(KIMONO_SIZES[kimonoCat] || []).map((sz) => (
                <option key={sz} value={sz}>{sz}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setField('item_estoque_id', `kimono:${kimonoCat}:${kimonoSize}`)}
            >
              Usar ID sugerido
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={lookupLoading}
              onClick={async () => {
                setLookupMsg('');
                if (!STOCK_ITEMS_COL) {
                  setLookupMsg('Coleção de estoque não configurada');
                  return;
                }
                try {
                  setLookupLoading(true);
                  let res = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
                    Query.equal('categoria', kimonoCat),
                    Query.equal('Tamanho', kimonoSize),
                  ]);
                  if (res.total === 0) {
                    res = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
                      Query.equal('categoria', kimonoCat),
                      Query.equal('tamanho', kimonoSize),
                    ]);
                  }
                  if (res.total > 0) {
                    const doc = res.documents[0];
                    setField('item_estoque_id', doc.$id);
                    const nome = doc.nome || doc.name || `${doc.categoria || kimonoCat} ${doc.Tamanho || doc.tamanho || kimonoSize}`;
                    setLookupMsg(`Encontrado: ${nome}`);
                  } else {
                    setLookupMsg('Nenhum item encontrado para a categoria/tamanho');
                  }
                } catch (e) {
                  setLookupMsg(`Erro ao buscar: ${e?.message || String(e)}`);
                } finally {
                  setLookupLoading(false);
                }
              }}
            >
              {lookupLoading ? 'Buscando...' : 'Buscar item no banco'}
            </button>
            <p className="text-xs text-light" style={{ alignSelf: 'center' }}>
              Gera um rótulo no formato kimono:categoria:tamanho. Ajuste conforme o seu cadastro.
            </p>
          </div>
          {lookupMsg && (
            <p className="text-small mt-1" style={{ color: 'var(--text-secondary)' }}>{lookupMsg}</p>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Tipo</label>
            <select className="form-input" value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="ajuste">Ajuste</option>
              <option value="saida_venda">Saída por Venda</option>
              <option value="saida_aluguel">Saída por Aluguel</option>
              <option value="devolucao">Devolução</option>
              <option value="avulso">Avulso</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Quantidade</label>
            <input type="number" className="form-input" value={form.quantidade} onChange={(e) => setField('quantidade', e.target.value)} />
          </div>
        </div>

        {form.tipo === 'ajuste' && (
          <div className="form-group mt-2">
            <label>Motivo</label>
            <input className="form-input" value={form.motivo} onChange={(e) => setField('motivo', e.target.value)} placeholder="Obrigatório para ajuste" />
          </div>
        )}

        {form.tipo === 'avulso' && (
          <div className="form-group mt-2">
            <label>Status do Par</label>
            <select className="form-input" value={form.status_par} onChange={(e) => setField('status_par', e.target.value)}>
              <option value="completo">Completo</option>
              <option value="avulso_cima">Avulso (Cima)</option>
              <option value="avulso_calca">Avulso (Calça)</option>
            </select>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button type="submit" className="btn-secondary" disabled={loading}>
            {form.tipo === 'entrada' && <PackagePlus size={16} />}
            {form.tipo === 'ajuste' && <Wrench size={16} />}
            {form.tipo === 'saida_venda' && <ArrowUpFromLine size={16} />}
            {form.tipo === 'saida_aluguel' && <ArrowUpFromLine size={16} />}
            {form.tipo === 'devolucao' && <ArrowDownToLine size={16} />}
            {form.tipo === 'avulso' && <Scissors size={16} />}
            <span style={{ marginLeft: 6 }}>Aplicar</span>
          </button>
        </div>
      </form>

      <div className="card mt-3">
        {error && <p className="text-small" style={{ color: 'var(--danger)' }}>{String(error)}</p>}
        {lastResult && (
          <div className="text-small">
            <div><strong>Total:</strong> {lastResult.saldos?.total}</div>
            <div><strong>Vendida:</strong> {lastResult.saldos?.vendida}</div>
            <div><strong>Alugada:</strong> {lastResult.saldos?.alugada}</div>
            <div><strong>Disponível:</strong> {lastResult.saldos?.disponivel}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
