import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, JOURNAL_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { PlusCircle, Trash2, Receipt } from 'lucide-react';
import { fmt } from './financeFmt.js';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { DateInputField } from '../DateInput';

export default function JournalTab({
  academyId,
  accounts,
  journal,
  setJournal,
  addEntry,
  deleteEntry,
  sectionTitle = 'Lançamentos contábeis',
}) {
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [direction, setDirection] = useState('all');
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState(null);
  const [lines, setLines] = useState([{ accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  const sortedAccounts = useMemo(() => {
    const copy = Array.isArray(accounts) ? [...accounts] : [];
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return copy;
  }, [accounts]);
  const accountById = useMemo(() => {
    const m = new Map();
    (sortedAccounts || []).forEach((a) => m.set(a.id, a));
    return m;
  }, [sortedAccounts]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !JOURNAL_COL) return;
      try {
        const res = await databases.listDocuments(DB_ID, JOURNAL_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderDesc('date'),
        ]);
        if (!active) return;
        const list = res.documents.map((d) => ({
          id: d.$id,
          date: d.date,
          memo: d.memo || '',
          createdAt: d.$createdAt || null,
          lines: (() => { try { return JSON.parse(d.lines || '[]'); } catch { return []; } })(),
        }));
        setJournal(list);
      } catch (e) { const _ = e; }
    };
    run();
    return () => { active = false; };
  }, [academyId, setJournal]);
  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Number(totalD.toFixed(2)) === Number(totalC.toFixed(2)) && totalD > 0;
  const addLine = () => setLines([...lines, { accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const submit = () => {
    if (!date || !balanced) return;
    const payload = { date, memo, lines: lines.map((l) => ({ ...l, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) };
    if (academyId && JOURNAL_COL) {
      databases.createDocument(DB_ID, JOURNAL_COL, 'unique()', {
        academyId,
        date,
        memo: memo || '',
        lines: JSON.stringify(payload.lines),
      }).then((doc) => {
        addEntry({ ...payload, id: doc.$id });
      }).catch(() => {
        addEntry(payload);
      });
    } else {
      addEntry(payload);
    }
    setDate('');
    setMemo('');
    setLines([{ accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  };

  const formatJournalListDate = (ymd) => {
    const s = String(ymd || '').slice(0, 10);
    if (s.length < 10) return '—';
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('pt-BR');
  };

  const formatMemoForDisplay = (rawMemo) => {
    const s = String(rawMemo || '').trim();
    if (!s) return '—';

    // Ex.: "Liquidação: product · 6a039baa00144eefddd3"
    // Mantemos o memo completo como `title`, mas escondemos o ID no texto exibido.
    const sep = ' · ';
    const idx = s.lastIndexOf(sep);
    if (idx > 0) {
      const left = s.slice(0, idx).trim();
      const right = s.slice(idx + sep.length).trim();
      const leftNorm = String(left || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (leftNorm.startsWith('liquidacao:') && /^[0-9a-z]{10,}$/i.test(right)) return left;
    }

    return s;
  };

  const filteredJournal = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const hasDateFilter = Boolean(fromDate || toDate);
    const dir = String(direction || 'all');
    return (journal || []).filter((entry) => {
      const memoText = String(entry.memo || '').toLowerCase();
      const detail = (entry.lines || [])
        .map((ln) => {
          const acc = accountById.get(ln.accountId);
          return `${acc?.name || ''} ${acc?.code || ''}`.toLowerCase();
        })
        .join(' ');
      if (q && !memoText.includes(q) && !detail.includes(q)) return false;

      if (dir !== 'all') {
        const hasDebit = (entry.lines || []).some((ln) => Number(ln.debit || 0) > 0);
        const hasCredit = (entry.lines || []).some((ln) => Number(ln.credit || 0) > 0);
        if (dir === 'debit' && !hasDebit) return false;
        if (dir === 'credit' && !hasCredit) return false;
      }

      if (hasDateFilter) {
        const raw = String(entry.createdAt || entry.date || '').slice(0, 10);
        if (fromDate && raw < fromDate) return false;
        if (toDate && raw > toDate) return false;
      }
      return true;
    });
  }, [journal, search, accountById, direction, fromDate, toDate]);

  const hasActiveFilters = Boolean(search || fromDate || toDate || direction !== 'all');

  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="finance-journal-head">
        <div className="finance-journal-head-icon" aria-hidden>
          <Receipt size={20} strokeWidth={1.75} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 className="navi-section-heading mb-1" style={{ marginBottom: 6 }}>{sectionTitle}</h3>
          <p className="finance-journal-lead">
            Registre partidas dobradas (soma de débitos = soma de créditos). Cada linha deve ter valor em débito ou em crédito — não nos dois.
          </p>
        </div>
      </div>

      <div className="finance-journal-panel">
        <p className="finance-journal-panel-title">Novo lançamento</p>
        <div className="finance-journal-meta">
          <div className="form-group">
            <label>Data</label>
            <DateInputField className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Histórico</label>
            <input className="form-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Ex.: Venda de kimonos, pagamento fornecedor…" />
          </div>
        </div>

        <div className="finance-journal-lines">
          {lines.map((l, idx) => (
            <div key={idx} className="finance-journal-line">
              <div className="form-group finance-journal-line-col--account">
                <label>Conta</label>
                <select
                  className="form-input"
                  value={l.accountId}
                  onChange={(e) => {
                    const arr = [...lines];
                    arr[idx] = { ...arr[idx], accountId: e.target.value };
                    setLines(arr);
                  }}
                >
                  <option value="">Selecione a conta…</option>
                  {sortedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Débito (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="0,00"
                  value={l.debit}
                  onChange={(e) => {
                    const arr = [...lines];
                    arr[idx] = { ...arr[idx], debit: e.target.value, credit: '' };
                    setLines(arr);
                  }}
                />
              </div>
              <div className="form-group">
                <label>Crédito (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="0,00"
                  value={l.credit}
                  onChange={(e) => {
                    const arr = [...lines];
                    arr[idx] = { ...arr[idx], credit: e.target.value, debit: '' };
                    setLines(arr);
                  }}
                />
              </div>
              <div className="form-group">
                <label>Caixa (DFC)</label>
                <select
                  className="form-input"
                  value={l.cash ? 'sim' : 'nao'}
                  onChange={(e) => {
                    const arr = [...lines];
                    arr[idx] = { ...arr[idx], cash: e.target.value === 'sim' };
                    setLines(arr);
                  }}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </div>
              <div className="form-group finance-journal-line-col--counter">
                <label>Contrapartida</label>
                <input
                  className="form-input"
                  placeholder="Prefixo ex. 4.1 ou 2.1"
                  value={l.counterCode}
                  onChange={(e) => {
                    const arr = [...lines];
                    arr[idx] = { ...arr[idx], counterCode: e.target.value };
                    setLines(arr);
                  }}
                />
              </div>
              <div className="finance-journal-line-remove finance-journal-line-col--remove">
                <button
                  type="button"
                  className="btn-ghost finance-accounts-delete"
                  title={lines.length <= 1 ? 'Mínimo de uma linha' : 'Remover linha'}
                  disabled={lines.length <= 1}
                  onClick={() => removeLine(idx)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="finance-journal-toolbar">
          <div className="finance-journal-pills">
            <span className="finance-journal-pill">Débitos: {fmt(totalD)}</span>
            <span className="finance-journal-pill">Créditos: {fmt(totalC)}</span>
            <span className={`finance-journal-pill ${balanced ? 'finance-journal-pill--ok' : 'finance-journal-pill--warn'}`}>
              {balanced ? 'Balanceado' : 'Desbalanceado'}
            </span>
          </div>
          <div className="finance-journal-actions">
            <button type="button" className="finance-journal-btn-ghost" onClick={addLine}>
              <PlusCircle size={18} aria-hidden />
              Adicionar linha
            </button>
            <button type="button" className="finance-journal-btn-primary" disabled={!balanced || !date} onClick={submit}>
              Lançar
            </button>
          </div>
        </div>
      </div>

      <div className="finance-journal-history">
        <p className="finance-journal-history-title">Histórico</p>
        <div className="finance-tx-filters" style={{ marginBottom: 10 }}>
          <input
            className="form-input"
            type="search"
            placeholder="Buscar por conta ou descrição"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DateInputField className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <DateInputField className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="form-input" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="all">Todos</option>
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
          </select>
          {hasActiveFilters ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearch('');
                setFromDate('');
                setToDate('');
                setDirection('all');
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th style={{ width: 112 }}>Data</th>
                <th>Histórico</th>
                <th className="finance-num" style={{ width: 120 }}>Débitos</th>
                <th className="finance-num" style={{ width: 120 }}>Créditos</th>
                <th className="finance-num" style={{ width: 72 }} aria-label="Excluir" />
              </tr>
            </thead>
            <tbody>
              {filteredJournal.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, verticalAlign: 'middle' }}>
                    <EmptyState
                      variant="table-cell"
                      tone="solid"
                      icon={Receipt}
                      title="Nenhum lançamento ainda"
                      description="Quando você gravar um lançamento balanceado, ele aparecerá aqui."
                      role="status"
                    />
                  </td>
                </tr>
              ) : (
                filteredJournal.map((e) => {
                  const sd = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
                  const sc = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
                  const detail = (e.lines || [])
                    .map((ln) => {
                      const acc = accountById.get(ln.accountId);
                      const label = acc ? `${acc.code} ${acc.name}` : 'Conta';
                      const v = Number(ln.debit || 0) > 0 ? `D ${fmt(ln.debit)}` : `C ${fmt(ln.credit)}`;
                      return `${label}: ${v}`;
                    })
                    .join(' · ');
                  return (
                    <tr key={e.id}>
                      <td>{formatJournalListDate(e.date)}</td>
                      <td>
                        <div
                          className="finance-journal-memo"
                          title={e.memo || '—'}
                        >
                          {formatMemoForDisplay(e.memo)}
                        </div>
                        {detail ? (
                          <div className="text-small" style={{ marginTop: 4, color: 'var(--text-secondary)', lineHeight: 1.35, whiteSpace: 'normal' }}>
                            {detail}
                          </div>
                        ) : null}
                      </td>
                      <td className="finance-num">{fmt(sd)}</td>
                      <td className="finance-num">{fmt(sc)}</td>
                      <td className="finance-num">
                        <button
                          type="button"
                          className="btn-ghost finance-accounts-delete"
                          title="Excluir lançamento"
                          onClick={() => {
                            setPendingDeleteEntry(e);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeleteEntry)}
        title="Excluir lançamento"
        description="Este lançamento será removido do extrato. A operação não pode ser desfeita. Confirmar?"
        confirmLabel="Excluir"
        confirmVariant="danger"
        onClose={() => setPendingDeleteEntry(null)}
        onConfirm={async () => {
          if (!pendingDeleteEntry) return;
          if (academyId && JOURNAL_COL) {
            await databases.deleteDocument(DB_ID, JOURNAL_COL, pendingDeleteEntry.id).catch(() => {});
          }
          deleteEntry(pendingDeleteEntry.id);
          setPendingDeleteEntry(null);
        }}
      />
    </section>
  );
}
