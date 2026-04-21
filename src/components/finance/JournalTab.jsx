import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, JOURNAL_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { PlusCircle, Trash2, Receipt } from 'lucide-react';
import { fmt } from './financeFmt.js';

export default function JournalTab({
  academyId,
  accounts,
  journal,
  setJournal,
  addEntry,
  deleteEntry,
}) {
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
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

  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="finance-journal-head">
        <div className="finance-journal-head-icon" aria-hidden>
          <Receipt size={20} strokeWidth={1.75} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 className="navi-section-heading mb-1" style={{ marginBottom: 6 }}>Lançamentos contábeis</h3>
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
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                  type="number"
                  step="0.01"
                  min="0"
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
                  type="number"
                  step="0.01"
                  min="0"
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
              {journal.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="finance-tx-empty">
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>Nenhum lançamento ainda</p>
                      <p>Quando você gravar um lançamento balanceado, ele aparecerá aqui.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                journal.map((e) => {
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
                        <div className="finance-journal-memo" title={e.memo || '—'}>{e.memo || '—'}</div>
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
                            if (academyId && JOURNAL_COL) databases.deleteDocument(DB_ID, JOURNAL_COL, e.id).catch(() => {});
                            deleteEntry(e.id);
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
    </section>
  );
}
