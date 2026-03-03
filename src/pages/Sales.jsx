import React, { useState } from 'react';
import { useSalesStore } from '../store/useSalesStore';
import { CreditCard, ShoppingCart, XCircle } from 'lucide-react';

const Sales = () => {
  const { createSale, cancelSale, creating, cancelling, lastSale, error } = useSalesStore();
  const [alunoId, setAlunoId] = useState('');
  const [forma, setForma] = useState('pix');
  const [itemId, setItemId] = useState('');
  const [qtd, setQtd] = useState(1);
  const [preco, setPreco] = useState(0);
  const [cancelId, setCancelId] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    await createSale({
      aluno_id: alunoId || null,
      forma_pagamento: forma,
      itens: [{ item_estoque_id: itemId, quantidade: Number(qtd), preco_unitario: Number(preco) }]
    });
  };

  const cancel = async (e) => {
    e.preventDefault();
    if (!cancelId) return;
    await cancelSale(cancelId);
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Vendas</h1>
        <p className="text-small">Registrar venda e cancelar</p>
      </div>

      <form className="card mt-4 animate-in" onSubmit={submit}>
        <div className="flex gap-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>ID do Aluno (opcional)</label>
            <input className="form-input" value={alunoId} onChange={(e) => setAlunoId(e.target.value)} placeholder="aluno_id" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Pagamento</label>
            <select className="form-input" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="pix">PIX</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <div className="form-group" style={{ flex: 2 }}>
            <label>ID do Item de Estoque</label>
            <input className="form-input" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="stock_item_id" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Quantidade</label>
            <input type="number" className="form-input" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Preço Unitário</label>
            <input type="number" step="0.01" className="form-input" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn-secondary mt-2" disabled={creating}>
          <ShoppingCart size={16} /> <span style={{ marginLeft: 6 }}>Concluir Venda</span>
        </button>
      </form>

      <form className="card mt-3" onSubmit={cancel}>
        <div className="flex gap-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>ID da Venda</label>
            <input className="form-input" value={cancelId} onChange={(e) => setCancelId(e.target.value)} placeholder="venda_id" />
          </div>
          <button type="submit" className="btn-outline" disabled={cancelling} style={{ alignSelf: 'flex-end', minHeight: 42 }}>
            <XCircle size={16} /> <span style={{ marginLeft: 6 }}>Cancelar</span>
          </button>
        </div>
      </form>

      <div className="card mt-3">
        {error && <p className="text-small" style={{ color: 'var(--danger)' }}>{String(error)}</p>}
        {lastSale && (
          <div className="text-small">
            <div><strong>Status:</strong> {lastSale.status || lastSale.ok ? 'OK' : ''}</div>
            {'total' in lastSale && <div><strong>Total:</strong> {lastSale.total}</div>}
            {'venda_id' in lastSale && <div><strong>Venda:</strong> {lastSale.venda_id}</div>}
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .btn-secondary svg { vertical-align: -3px }
        .btn-outline svg { vertical-align: -3px }
      `}} />
    </div>
  );
};

export default Sales;
