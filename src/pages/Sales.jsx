import React, { useEffect, useMemo, useState } from 'react';
import { useSalesStore } from '../store/useSalesStore';
import { ShoppingCart, XCircle, Search, PlusCircle, Trash2 } from 'lucide-react';
import { databases, DB_ID, STOCK_ITEMS_COL, LEADS_COL } from '../lib/appwrite';
import { Query } from 'appwrite';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';

const Sales = () => {
  const { createSale, cancelSale, creating, cancelling, lastSale, error } = useSalesStore();
  const academyId = useLeadStore(s => s.academyId);
  const addToast = useUiStore(s => s.addToast);
  const [alunoId, setAlunoId] = useState('');
  const [forma, setForma] = useState('pix');
  const [itemId, setItemId] = useState('');
  const [qtd, setQtd] = useState(1);
  const [precoCents, setPrecoCents] = useState(0);
  const [descontoCents, setDescontoCents] = useState(0);
  const [descontoPct, setDescontoPct] = useState(0);
  const [descontoTipo, setDescontoTipo] = useState('valor');
  const [cancelId, setCancelId] = useState('');
  const [cart, setCart] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookup, setLookup] = useState(null);
  const [localError, setLocalError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [descGeralTipo, setDescGeralTipo] = useState('valor');
  const [descGeralCents, setDescGeralCents] = useState(0);
  const [descGeralPct, setDescGeralPct] = useState(0);
  const [alunoSearchText, setAlunoSearchText] = useState('');
  const [alunoSuggestions, setAlunoSuggestions] = useState([]);
  const [alunoBusy, setAlunoBusy] = useState(false);
  const [alunoNomeSel, setAlunoNomeSel] = useState('');
  const [receipt, setReceipt] = useState(null);

  const precoMasked = useMemo(() => {
    const v = (Number(precoCents) || 0) / 100;
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [precoCents]);
  const descontoMasked = useMemo(() => {
    const v = (Number(descontoCents) || 0) / 100;
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [descontoCents]);
  const descGeralMasked = useMemo(() => {
    const v = (Number(descGeralCents) || 0) / 100;
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [descGeralCents]);

  const parseMaskToCents = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return 0;
    return parseInt(digits, 10);
  };
  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  const addToCart = () => {
    setLocalError('');
    const q = Number(qtd);
    const cents = Number(precoCents);
    const desc = descontoTipo === 'valor'
      ? Number(descontoCents)
      : Math.floor(Number(cents) * (Number(descontoPct) || 0) / 100);
    if (!itemId) {
      setLocalError('Informe o ID do item');
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setLocalError('Quantidade inválida');
      return;
    }
    if (!Number.isFinite(cents) || cents < 0 || !Number.isFinite(desc) || desc < 0) {
      setLocalError('Preço inválido');
      return;
    }
    if (desc > cents) {
      setLocalError('Desconto maior que o preço');
      return;
    }
    if (lookup && typeof lookup.disponivel === 'number' && q > lookup.disponivel) {
      setLocalError('Quantidade acima do disponível em estoque');
      return;
    }
    const netCents = Math.max(0, cents - desc);
    const existsIdx = cart.findIndex((it) => it.item_estoque_id === itemId && Math.round(it.preco_unitario * 100) === netCents);
    if (existsIdx >= 0) {
      const next = [...cart];
      next[existsIdx] = { ...next[existsIdx], quantidade: Number(next[existsIdx].quantidade) + q };
      setCart(next);
    } else {
      setCart([...cart, { item_estoque_id: itemId, quantidade: q, preco_unitario: netCents / 100, preco_bruto: cents / 100, desconto: desc / 100 }]);
    }
    setItemId('');
    setQtd(1);
    setPrecoCents(0);
    setDescontoCents(0);
    setDescontoPct(0);
    setLookup(null);
  };

  const removeFromCart = (idx) => {
    const next = cart.slice(0, idx).concat(cart.slice(idx + 1));
    setCart(next);
  };

  const totalCart = useMemo(() => {
    return cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario), 0);
  }, [cart]);
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

  const buscarItem = async () => {
    setLocalError('');
    setLookup(null);
    if (!itemId || !STOCK_ITEMS_COL || !DB_ID) {
      setLocalError('Informe um ID válido');
      return;
    }
    setLookupLoading(true);
    try {
      const doc = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, itemId);
      const total = Number(doc.quantidade_total || 0);
      const vendida = Number(doc.quantidade_vendida || 0);
      const alugada = Number(doc.quantidade_alugada || 0);
      const disponivel = total - vendida - alugada;
      setLookup({
        id: doc.$id,
        nome: doc.nome || doc.descricao || '',
        disponivel
      });
    } catch {
      setLocalError('Item não encontrado');
    } finally {
      setLookupLoading(false);
    }
  };

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
        try {
          const res = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
            Query.search('nome', t),
            Query.limit(8),
          ]);
          docs = res.documents;
        } catch {
          try {
            const res2 = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [
              Query.search('descricao', t),
              Query.limit(8),
            ]);
            docs = res2.documents;
          } catch {
            docs = [];
          }
        }
        if (!active) return;
        const mapped = docs.map((d) => {
          const total = Number(d.quantidade_total || 0);
          const vendida = Number(d.quantidade_vendida || 0);
          const alugada = Number(d.quantidade_alugada || 0);
          const disponivel = total - vendida - alugada;
          return {
            id: d.$id,
            nome: d.nome || d.descricao || d.$id,
            disponivel
          };
        });
        setSuggestions(mapped);
      } finally {
        if (active) setSearchBusy(false);
      }
    };
    const h = setTimeout(run, 300);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [searchText]);

  const chooseSuggestion = (sug) => {
    setItemId(sug.id);
    setLookup({ id: sug.id, nome: sug.nome, disponivel: sug.disponivel });
    setSuggestions([]);
    setSearchText('');
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
        const mapped = docs.map(d => ({
          id: d.$id,
          nome: d.name || d.$id,
          phone: d.phone || ''
        }));
        setAlunoSuggestions(mapped);
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
    setAlunoNomeSel(`${s.nome}${s.phone ? ' • ' + s.phone : ''}`);
    setAlunoSuggestions([]);
    setAlunoSearchText('');
  };

  const updateCartQty = (idx, val) => {
    const q = Math.max(1, parseInt(String(val || '').replace(/\D/g, ''), 10) || 1);
    const next = [...cart];
    next[idx] = { ...next[idx], quantidade: q };
    setCart(next);
  };
  const updateCartBasePrice = (idx, masked) => {
    const cents = parseMaskToCents(masked);
    const base = cents / 100;
    const next = [...cart];
    const disc = Number(next[idx].desconto || 0);
    const net = Math.max(0, base - disc);
    next[idx] = { ...next[idx], preco_bruto: base, preco_unitario: net };
    setCart(next);
  };
  const updateCartDiscount = (idx, masked) => {
    const cents = parseMaskToCents(masked);
    const disc = cents / 100;
    const next = [...cart];
    const base = Number(next[idx].preco_bruto ?? next[idx].preco_unitario);
    const net = Math.max(0, base - disc);
    next[idx] = { ...next[idx], desconto: disc, preco_unitario: net };
    setCart(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um item');
      return;
    }
    const itemsTotalBase = cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_bruto ?? it.preco_unitario), 0);
    const itemsDiscount = cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.desconto ?? 0), 0);
    const itens = cart.map((it) => {
      let unit = Number(it.preco_unitario);
      if (fatorGeral < 1) {
        unit = round2(unit * fatorGeral);
        if (unit < 0) unit = 0;
      }
      return {
        item_estoque_id: it.item_estoque_id,
        quantidade: Number(it.quantidade),
        preco_unitario: unit
      };
    });
    await createSale({
      aluno_id: alunoId || null,
      forma_pagamento: forma,
      itens,
      idempotency_key: `${alunoId || 'anon'}:${Date.now()}:${cart.length}`
    });
    const st = useSalesStore.getState();
    if (st.error) {
      addToast({ type: 'error', message: `Erro na venda: ${st.error}` });
    } else {
      addToast({ type: 'success', message: 'Venda concluída' });
      const vendaId = st.lastSale?.venda_id || '';
      const totalFinal = round2((cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario), 0)) * fatorGeral);
      const descontoGeralAplicado = round2(itemsTotalBase * (1 - fatorGeral));
      setReceipt({
        vendaId,
        items: cart.map(it => ({
          id: it.item_estoque_id,
          qtd: Number(it.quantidade),
          precoBase: Number(it.preco_bruto ?? it.preco_unitario),
          descontoItem: Number(it.desconto ?? 0),
          precoLiq: Number(it.preco_unitario) * fatorGeral,
        })),
        subtotal: round2(itemsTotalBase),
        descontoItens: round2(itemsDiscount),
        descontoGeral: descontoGeralAplicado,
        total: totalFinal,
      });
    }
    setCart([]);
    setLookup(null);
    setDescGeralCents(0);
    setDescGeralPct(0);
  };

  const cancel = async (e) => {
    e.preventDefault();
    if (!cancelId) return;
    await cancelSale(cancelId);
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Vendas</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>Registrar venda e cancelar</p>
      </div>

      <form className="card mt-4 animate-in" onSubmit={submit}>
        <div className="flex gap-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Aluno (opcional)</label>
            <input className="form-input" value={alunoSearchText} onChange={(e) => setAlunoSearchText(e.target.value)} placeholder="buscar por nome ou celular" />
            {alunoSuggestions.length > 0 && (
              <div className="suggestions" style={{ marginTop: 6 }}>
                {alunoSuggestions.map(s => (
                  <div key={s.id} className="suggestion" onClick={() => chooseAluno(s)}>
                    <div style={{ flex: 1 }}>{s.nome}</div>
                    <div className="text-small" style={{ opacity: 0.8 }}>{s.phone}</div>
                  </div>
                ))}
              </div>
            )}
            {alunoBusy && <div className="text-small" style={{ opacity: 0.7, marginTop: 4 }}>Buscando...</div>}
            {alunoNomeSel && <div className="text-small" style={{ marginTop: 6 }}><strong>Selecionado:</strong> {alunoNomeSel}</div>}
            <input type="text" className="form-input" value={alunoId} onChange={(e) => setAlunoId(e.target.value)} placeholder="aluno_id (opcional)" style={{ marginTop: 6 }} />
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
            <div className="flex" style={{ gap: 8 }}>
              <input className="form-input" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="stock_item_id" />
              <button type="button" className="btn-outline" onClick={buscarItem} disabled={lookupLoading || !itemId} title="Buscar" style={{ minWidth: 42 }}>
                <Search size={16} />
              </button>
            </div>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Quantidade</label>
            <input type="number" className="form-input" value={qtd} onChange={(e) => setQtd(e.target.value)} min={1} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Preço Unitário</label>
            <input
              type="text"
              className="form-input"
              value={precoMasked}
              onChange={(e) => setPrecoCents(parseMaskToCents(e.target.value))}
            />
            <span className="text-small" style={{ opacity: 0.7 }}>Valor em BRL</span>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Tipo Desc.</label>
            <select className="form-input" value={descontoTipo} onChange={(e) => setDescontoTipo(e.target.value)}>
              <option value="valor">R$</option>
              <option value="percent">% </option>
            </select>
          </div>
          {descontoTipo === 'valor' ? (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Desconto por Item</label>
              <input
                type="text"
                className="form-input"
                value={descontoMasked}
                onChange={(e) => setDescontoCents(parseMaskToCents(e.target.value))}
              />
              <span className="text-small" style={{ opacity: 0.7 }}>Desconto em BRL</span>
            </div>
          ) : (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Desconto por Item (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="form-input"
                value={descontoPct}
                onChange={(e) => setDescontoPct(e.target.value)}
              />
            </div>
          )}
        </div>
        {lookup && (
          <div className="text-small" style={{ marginTop: 6 }}>
            <span><strong>Item:</strong> {lookup.nome || lookup.id}</span>
            <span style={{ marginLeft: 12 }}><strong>Disponível:</strong> {lookup.disponivel}</span>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Desconto Geral</label>
            <select className="form-input" value={descGeralTipo} onChange={(e) => setDescGeralTipo(e.target.value)}>
              <option value="valor">R$</option>
              <option value="percent">% </option>
            </select>
          </div>
          {descGeralTipo === 'valor' ? (
            <div className="form-group" style={{ flex: 2 }}>
              <label>Valor</label>
              <input
                type="text"
                className="form-input"
                value={descGeralMasked}
                onChange={(e) => setDescGeralCents(parseMaskToCents(e.target.value))}
              />
            </div>
          ) : (
            <div className="form-group" style={{ flex: 2 }}>
              <label>Percentual (%)</label>
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
        <div className="form-group mt-2">
          <label>Buscar item por nome</label>
          <input
            className="form-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="digite parte do nome"
          />
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s) => (
                <div key={s.id} className="suggestion" onClick={() => chooseSuggestion(s)}>
                  <div style={{ flex: 1 }}>{s.nome}</div>
                  <div className="text-small" style={{ opacity: 0.8 }}>Disp: {s.disponivel}</div>
                </div>
              ))}
            </div>
          )}
          {searchBusy && <div className="text-small" style={{ opacity: 0.7, marginTop: 4 }}>Buscando...</div>}
        </div>
        <div className="flex" style={{ marginTop: 8 }}>
          <button type="button" className="btn-outline" onClick={addToCart} disabled={creating}>
            <PlusCircle size={16} /> <span style={{ marginLeft: 6 }}>Adicionar ao Carrinho</span>
          </button>
        </div>

        {cart.length > 0 && (
          <div className="mt-3">
            <div className="table">
              <div className="row header">
                <div style={{ flex: 3 }}>Item</div>
                <div style={{ flex: 1, textAlign: 'right' }}>Qtd</div>
                <div style={{ flex: 2, textAlign: 'right' }}>Preço Base</div>
                <div style={{ flex: 2, textAlign: 'right' }}>Desconto</div>
                <div style={{ flex: 2, textAlign: 'right' }}>Preço Líquido</div>
                <div style={{ flex: 2, textAlign: 'right' }}>Subtotal</div>
                <div style={{ width: 48 }}></div>
              </div>
              {cart.map((it, idx) => {
                const base = Number(it.preco_bruto ?? it.preco_unitario);
                const desc = Number(it.desconto ?? 0);
                const net = Number(it.preco_unitario);
                const subtotal = Number(it.quantidade) * net;
                const netFmt = (() => {
                  try { return net.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${net.toFixed(2)}`.replace('.', ','); }
                })();
                const subtotalFmt = (() => {
                  try { return subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${subtotal.toFixed(2)}`.replace('.', ','); }
                })();
                return (
                  <div className="row" key={`${it.item_estoque_id}-${idx}`}>
                    <div style={{ flex: 3 }}>{it.item_estoque_id}</div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <input
                        type="number"
                        min={1}
                        className="table-input"
                        value={it.quantidade}
                        onChange={(e) => updateCartQty(idx, e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 2, textAlign: 'right' }}>
                      <input
                        type="text"
                        className="table-input"
                        value={(() => { try { return base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${base.toFixed(2)}`.replace('.', ','); } })()}
                        onChange={(e) => updateCartBasePrice(idx, e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 2, textAlign: 'right' }}>
                      <input
                        type="text"
                        className="table-input"
                        value={(() => { try { return desc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${desc.toFixed(2)}`.replace('.', ','); } })()}
                        onChange={(e) => updateCartDiscount(idx, e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 2, textAlign: 'right' }}>{netFmt}</div>
                    <div style={{ flex: 2, textAlign: 'right' }}>{subtotalFmt}</div>
                    <div style={{ width: 48, textAlign: 'right' }}>
                      <button type="button" className="btn-ghost" onClick={() => removeFromCart(idx)} title="Remover">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex" style={{ justifyContent: 'flex-end', marginTop: 8, gap: 16 }}>
              <div><strong>Subtotal: </strong>{subtotalMasked}</div>
              <div><strong>Desconto Geral: </strong>{descGeralMaskedOut}</div>
              <div><strong>Total: </strong>{totalMasked}</div>
            </div>
          </div>
        )}

        <button type="submit" className="btn-secondary mt-2" disabled={creating || cart.length === 0}>
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
        {(localError || error) && <p className="text-small" style={{ color: 'var(--danger)' }}>{String(localError || error)}</p>}
        {lastSale && (
          <div className="text-small">
            <div><strong>Status:</strong> {lastSale.status || lastSale.ok ? 'OK' : ''}</div>
            {'total' in lastSale && <div><strong>Total:</strong> {(() => { try { return Number(lastSale.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${Number(lastSale.total).toFixed(2)}`.replace('.', ','); } })()}</div>}
            {'venda_id' in lastSale && <div><strong>Venda:</strong> {lastSale.venda_id}</div>}
          </div>
        )}
      </div>
      {receipt && (
        <div className="card mt-3">
          <div style={{ marginBottom: 6 }}><strong>Comprovante</strong></div>
          <div className="text-small">
            <div><strong>Venda:</strong> {receipt.vendaId || '(pendente)'}</div>
            <div style={{ marginTop: 6 }}>
              {receipt.items.map((it, i) => {
                const unitFmt = (() => { try { return (Number(it.precoLiq)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${Number(it.precoLiq).toFixed(2)}`.replace('.', ','); } })();
                return <div key={i}>• {it.id}: {it.qtd} x {unitFmt}</div>;
              })}
            </div>
            <div style={{ marginTop: 6 }}>
              <div><strong>Subtotal:</strong> {(() => { try { return receipt.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${receipt.subtotal.toFixed(2)}`.replace('.', ','); } })()}</div>
              <div><strong>Descontos (itens):</strong> {(() => { try { return receipt.descontoItens.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${receipt.descontoItens.toFixed(2)}`.replace('.', ','); } })()}</div>
              <div><strong>Desconto Geral:</strong> {(() => { try { return receipt.descontoGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${receipt.descontoGeral.toFixed(2)}`.replace('.', ','); } })()}</div>
              <div><strong>Total economizado:</strong> {(() => { const s = receipt.descontoItens + receipt.descontoGeral; try { return s.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${s.toFixed(2)}`.replace('.', ','); } })()}</div>
              <div><strong>Total:</strong> {(() => { try { return receipt.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return `R$ ${receipt.total.toFixed(2)}`.replace('.', ','); } })()}</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn-outline" onClick={() => window.print()}>Imprimir Comprovante</button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .btn-secondary svg { vertical-align: -3px }
        .btn-outline svg { vertical-align: -3px }
        .btn-ghost { background: transparent; border: none; padding: 6px; color: var(--text); cursor: pointer }
        .table { width: 100%; }
        .table .row { display: flex; padding: 8px 0; border-bottom: 1px solid var(--border); align-items: center }
        .table .header { font-weight: 600; border-bottom: 2px solid var(--border) }
        .suggestions { margin-top: 6px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
        .suggestion { display: flex; gap: 8px; padding: 8px 10px; cursor: pointer; align-items: center; }
        .suggestion:hover { background: var(--bg-hover); }
        .table-input { width: 100%; text-align: right; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; }
      `}} />
    </div>
  );
};

export default Sales;
