import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { ShoppingCart } from 'lucide-react';
import { databases, DB_ID, LEADS_COL, ACADEMIES_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { useLeadStore, LEAD_STATUS } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import { suggestUnitPrice } from '../../lib/salesCatalog';
import { readSalesSettings, SALES_CHANNEL_OPTIONS } from '../../lib/salesSettings';
import { parseMaskToCents, formatBRLFromCents } from '../../lib/moneyBr';
import SalesCatalogPicker from './SalesCatalogPicker';
import SalesCart from './SalesCart';
import SalesReceiptPanel from './SalesReceiptPanel';

export default function SalesNewSaleTab() {
  const { createSale, creating, lastSale, error } = useSalesStore();
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);
  const { products, loading: catalogLoading, reload: reloadCatalog } = useSalesCatalog(academyId);

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');

  const [alunoId, setAlunoId] = useState('');
  const [alunoSearchText, setAlunoSearchText] = useState('');
  const [alunoSuggestions, setAlunoSuggestions] = useState([]);
  const [alunoBusy, setAlunoBusy] = useState(false);
  const [alunoNomeSel, setAlunoNomeSel] = useState('');

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');

  const [forma, setForma] = useState('pix');
  const [canal, setCanal] = useState('presencial');
  const [vendaColaborador, setVendaColaborador] = useState(false);

  const [cart, setCart] = useState([]);
  const [localError, setLocalError] = useState('');

  const [descGeralTipo, setDescGeralTipo] = useState('valor');
  const [descGeralCents, setDescGeralCents] = useState(0);
  const [descGeralPct, setDescGeralPct] = useState(0);

  const [receipt, setReceipt] = useState(null);

  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  useEffect(() => {
    if (!academyId || !ACADEMIES_COL || !DB_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademyName(String(doc.name || '').trim());
        setSalesSettings(readSalesSettings(doc.settings));
      } catch (e) {
        console.error('[Sales] academy load', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    if (!vendaColaborador) return;
    setCart((prev) => {
      const warnings = [];
      const next = prev.map((line) => {
        const { price, warning } = suggestUnitPrice(
          { sale_price: line.sale_price, cost_price: line.cost_price },
          { collaborator: true }
        );
        if (warning) warnings.push(`${line.display_label}: ${warning}`);
        return { ...line, preco_unitario: price != null ? price : line.preco_unitario };
      });
      if (warnings.length) {
        addToast({ type: 'warning', message: warnings[0] });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaColaborador]);

  useEffect(() => {
    if (vendaColaborador) return;
    setCart((prev) =>
      prev.map((line) => {
        const { price } = suggestUnitPrice(
          { sale_price: line.sale_price, cost_price: line.cost_price },
          { collaborator: false }
        );
        if (line.sale_price != null) {
          return { ...line, preco_unitario: line.sale_price };
        }
        if (price != null) return { ...line, preco_unitario: price };
        return line;
      })
    );
  }, [vendaColaborador]);

  const totalCart = useMemo(
    () => cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario || 0), 0),
    [cart]
  );

  const descontoGeralValor = useMemo(() => {
    if (totalCart <= 0) return 0;
    if (descGeralTipo === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(descGeralPct) || 0));
      return round2(totalCart * pct / 100);
    }
    return Math.min((Number(descGeralCents) || 0) / 100, totalCart);
  }, [descGeralTipo, descGeralCents, descGeralPct, totalCart]);

  const fatorGeral = useMemo(() => {
    if (totalCart <= 0) return 1;
    const rest = totalCart - descontoGeralValor;
    return rest > 0 ? rest / totalCart : 0;
  }, [descontoGeralValor, totalCart]);

  const totalMasked = useMemo(() => {
    const val = round2(totalCart * fatorGeral);
    try {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${val.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart, fatorGeral]);

  const subtotalMasked = useMemo(() => {
    try {
      return totalCart.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${totalCart.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart]);

  const descGeralMaskedOut = useMemo(() => {
    const v = round2(totalCart - totalCart * fatorGeral);
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart, fatorGeral]);

  const descGeralMasked = useMemo(() => formatBRLFromCents(descGeralCents), [descGeralCents]);

  const pickProduct = useCallback(
    (product) => {
      setLocalError('');
      const { price, warning } = suggestUnitPrice(product, { collaborator: vendaColaborador });
      if (warning) addToast({ type: 'warning', message: warning });
      if (salesSettings.lockPriceEdit && price == null) {
        addToast({
          type: 'error',
          message: 'Preço não cadastrado. Defina no cadastro de produtos ou desbloqueie a edição em Configurações → Vendas.',
        });
        return;
      }

      const unit = price != null ? price : null;
      const idx = cart.findIndex((c) => c.item_estoque_id === product.id);
      if (idx >= 0) {
        const next = [...cart];
        const newQ = Number(next[idx].quantidade) + 1;
        if (product.current_quantity > 0 && newQ > product.current_quantity) {
          addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
          return;
        }
        next[idx] = { ...next[idx], quantidade: newQ };
        setCart(next);
        return;
      }

      setCart((prev) => [
        ...prev,
        {
          item_estoque_id: product.id,
          display_label: product.display_label,
          variacao: product.Tamanho || '',
          quantidade: 1,
          preco_unitario: unit,
          sale_price: product.sale_price,
          cost_price: product.cost_price,
          disponivel: product.current_quantity,
        },
      ]);
    },
    [cart, vendaColaborador, salesSettings.lockPriceEdit, addToast]
  );

  const updateCartQty = (idx, val) => {
    const q = Math.max(1, parseInt(String(val || '').replace(/\D/g, ''), 10) || 1);
    const line = cart[idx];
    if (line?.disponivel > 0 && q > line.disponivel) {
      addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
      return;
    }
    const next = [...cart];
    next[idx] = { ...next[idx], quantidade: q };
    setCart(next);
  };

  const updateCartPrice = (idx, cents) => {
    const next = [...cart];
    next[idx] = { ...next[idx], preco_unitario: cents > 0 ? cents / 100 : null };
    setCart(next);
  };

  const removeFromCart = (idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      const t = String(alunoSearchText || '').trim();
      if (!academyId || t.length < 2 || !DB_ID || !LEADS_COL) {
        if (active) setAlunoSuggestions([]);
        return;
      }
      setAlunoBusy(true);
      try {
        let docs = [];
        try {
          const res = await databases.listDocuments(DB_ID, LEADS_COL, [
            Query.equal('academyId', academyId),
            Query.equal('status', LEAD_STATUS.CONVERTED),
            Query.search('name', t),
            Query.limit(8),
          ]);
          docs = res.documents;
        } catch {
          try {
            const res2 = await databases.listDocuments(DB_ID, LEADS_COL, [
              Query.equal('academyId', academyId),
              Query.equal('status', LEAD_STATUS.CONVERTED),
              Query.search('phone', t),
              Query.limit(8),
            ]);
            docs = res2.documents;
          } catch {
            docs = [];
          }
        }
        if (!active) return;
        setAlunoSuggestions(
          docs.map((d) => ({
            id: d.$id,
            nome: d.name || d.$id,
            phone: d.phone || '',
          }))
        );
      } finally {
        if (active) setAlunoBusy(false);
      }
    };
    const h = setTimeout(run, 300);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [alunoSearchText, academyId]);

  const chooseAluno = (s) => {
    setAlunoId(s.id);
    setAlunoNomeSel(`${s.nome}${s.phone ? ` • ${s.phone}` : ''}`);
    setClienteNome('');
    setClienteTelefone('');
    setAlunoSuggestions([]);
    setAlunoSearchText('');
  };

  const clientDisplayName = alunoNomeSel || clienteNome.trim() || 'Cliente avulso';

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um item');
      return;
    }
    for (const it of cart) {
      const unit = Number(it.preco_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        setLocalError(`Informe o preço de "${it.display_label}"`);
        return;
      }
      if (salesSettings.lockPriceEdit && unit <= 0) {
        setLocalError(`Preço obrigatório para "${it.display_label}"`);
        return;
      }
    }

    const itens = cart.map((it) => {
      let unit = Number(it.preco_unitario);
      if (fatorGeral < 1) {
        unit = round2(unit * fatorGeral);
        if (unit < 0) unit = 0;
      }
      return {
        item_estoque_id: it.item_estoque_id,
        quantidade: Number(it.quantidade),
        preco_unitario: unit,
      };
    });

    const now = new Date();
    await createSale({
      aluno_id: alunoId || null,
      forma_pagamento: forma,
      canal,
      cliente_nome: !alunoId ? clienteNome.trim() || null : null,
      cliente_telefone: !alunoId ? clienteTelefone.trim() || null : null,
      venda_colaborador: vendaColaborador,
      itens,
      idempotency_key: `${alunoId || clienteNome || 'anon'}:${Date.now()}:${cart.length}`,
    });

    const st = useSalesStore.getState();
    if (st.error) {
      addToast({ type: 'error', message: 'Não foi possível registrar a venda. Revise as informações e tente novamente.' });
      return;
    }

    addToast({ type: 'success', message: 'Venda concluída' });
    const vendaId = st.lastSale?.venda_id || '';
    const totalFinal = round2(totalCart * fatorGeral);
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    setReceipt({
      vendaId,
      date: dateStr,
      time: timeStr,
      canal,
      clientName: clientDisplayName,
      forma,
      items: cart.map((it) => ({
        display_label: it.display_label,
        quantidade: Number(it.quantidade),
        preco_unitario: round2(Number(it.preco_unitario) * fatorGeral),
        subtotal: round2(Number(it.quantidade) * Number(it.preco_unitario) * fatorGeral),
      })),
      total: totalFinal,
    });

    setCart([]);
    setDescGeralCents(0);
    setDescGeralPct(0);
    void reloadCatalog();
  };

  const copyReceipt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Comprovante copiado' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  return (
    <>
      <form className="card mt-4 animate-in" onSubmit={submit}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label>Aluno (opcional)</label>
            <input
              className="form-input"
              value={alunoSearchText}
              onChange={(e) => setAlunoSearchText(e.target.value)}
              placeholder="Buscar por nome ou celular"
            />
            {alunoSuggestions.length > 0 && (
              <div className="suggestions" style={{ marginTop: 6 }}>
                {alunoSuggestions.map((s) => (
                  <div key={s.id} className="suggestion" onClick={() => chooseAluno(s)}>
                    <div style={{ flex: 1 }}>{s.nome}</div>
                    <div className="text-small" style={{ opacity: 0.8 }}>
                      {s.phone}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {alunoBusy && <div className="text-small text-muted mt-1">Buscando…</div>}
            {alunoNomeSel ? (
              <div className="text-small mt-1">
                <strong>Selecionado:</strong> {alunoNomeSel}
              </div>
            ) : null}
          </div>

          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label>Canal</label>
            <select className="form-input" value={canal} onChange={(e) => setCanal(e.target.value)}>
              {SALES_CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ flex: '1 1 160px' }}>
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

        {!alunoId && (
          <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
              <label>Nome do cliente</label>
              <input
                className="form-input"
                maxLength={128}
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Cliente avulso"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>Telefone</label>
              <input
                className="form-input"
                maxLength={20}
                value={clienteTelefone}
                onChange={(e) => setClienteTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 mt-2" style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={vendaColaborador}
            onChange={(e) => setVendaColaborador(e.target.checked)}
          />
          Venda para colaborador (usa preço de custo quando cadastrado)
        </label>

        <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid var(--border-light)' }} />

        <SalesCatalogPicker products={products} loading={catalogLoading} onPick={pickProduct} />

        <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Desconto geral</label>
            <select className="form-input" value={descGeralTipo} onChange={(e) => setDescGeralTipo(e.target.value)}>
              <option value="valor">R$</option>
              <option value="percent">%</option>
            </select>
          </div>
          {descGeralTipo === 'valor' ? (
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
              <label className="text-xs">Valor</label>
              <input
                type="text"
                className="form-input"
                value={descGeralMasked}
                onChange={(e) => setDescGeralCents(parseMaskToCents(e.target.value))}
              />
            </div>
          ) : (
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 80 }}>
              <label className="text-xs">%</label>
              <input
                type="number"
                min={0}
                max={100}
                className="form-input"
                value={descGeralPct}
                onChange={(e) => setDescGeralPct(e.target.value)}
              />
            </div>
          )}
        </div>

        <SalesCart
          cart={cart}
          lockPriceEdit={salesSettings.lockPriceEdit}
          onQtyChange={updateCartQty}
          onPriceChange={updateCartPrice}
          onRemove={removeFromCart}
          subtotalMasked={subtotalMasked}
          descGeralMasked={descGeralMaskedOut}
          totalMasked={totalMasked}
        />

        <button type="submit" className="btn-secondary mt-3" disabled={creating || cart.length === 0}>
          <ShoppingCart size={16} /> <span style={{ marginLeft: 6 }}>Concluir venda</span>
        </button>
      </form>

      {(localError || error) && (
        <p className="text-small mt-2" style={{ color: 'var(--danger)' }}>
          {String(localError || error)}
        </p>
      )}

      <SalesReceiptPanel
        receipt={receipt}
        settings={salesSettings}
        academyName={academyName}
        onCopy={copyReceipt}
      />

      {lastSale && !receipt && (
        <div className="card mt-3 text-small">
          <div>
            <strong>Última operação:</strong> {lastSale.status || (lastSale.ok ? 'OK' : '')}
          </div>
          {'venda_id' in lastSale && <div>Venda: {lastSale.venda_id}</div>}
        </div>
      )}

      <style>{`
        .sales-catalog__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .sales-catalog__chip {
          border: 1px solid var(--border);
          background: var(--surface-1, transparent);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          cursor: pointer;
        }
        .sales-catalog__chip.active { background: var(--primary); color: var(--primary-contrast, #fff); border-color: var(--primary); }
        .sales-catalog__group { margin-bottom: 16px; }
        .sales-catalog__group-title { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
        .sales-catalog__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
        .sales-catalog__card {
          display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
          padding: 10px 12px; border-radius: 8px; border: 2px solid var(--border);
          background: var(--card-bg, var(--surface-1));
          text-align: left; width: 100%;
        }
        .sales-catalog__card-name { font-weight: 600; font-size: 14px; }
        .sales-catalog__card-meta { display: flex; justify-content: space-between; width: 100%; font-size: 12px; gap: 8px; flex-wrap: wrap; }
        .suggestions { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
        .suggestion { display: flex; gap: 8px; padding: 8px 10px; cursor: pointer; align-items: center; }
        .suggestion:hover { background: var(--bg-hover); }
        .btn-ghost { background: transparent; border: none; padding: 6px; cursor: pointer; color: var(--text); }
      `}</style>
    </>
  );
}


