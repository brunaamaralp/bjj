import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Upload } from 'lucide-react';
import ImportStatementModal from './ImportStatementModal.jsx';
import {
  listBankStatements,
  getBankStatementDetail,
  confirmBankMatch,
  confirmAllBankMatches,
  ignoreBankItem,
  manualReconcileTx,
  createTxFromBankItem,
  completeBankReconciliation,
} from '../../lib/bankReconciliationApi.js';
import { friendlyError } from '../../lib/errorMessages';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const STATUS_LABELS = {
  pending: 'Pendente',
  partial: 'Parcial',
  reconciled: 'Conciliado',
};

const STATUS_BADGE_CLASS = {
  pending: 'finance-badge-pendente',
  partial: 'finance-badge-parcial',
  reconciled: 'finance-badge-pago',
};

function MatchRow({ item, tx, tone, onConfirm, onIgnore, busy }) {
  return (
    <div className={`bank-recon-pair bank-recon-pair--${tone}`}>
      <div className="bank-recon-pair__bank">
        <p className="bank-recon-pair__title">{item.description}</p>
        <p className="text-xs text-muted">
          {fmtDate(item.date)} · {item.direction === 'credit' ? 'Crédito' : 'Débito'} · {fmtMoney(item.amount)}
          {item.match_score > 0 && item.match_score < 100 ? (
            <span className="bank-recon-confidence"> · {item.match_score}% confiança</span>
          ) : null}
        </p>
      </div>
      <div className="bank-recon-pair__navi">
        {tx ? (
          <>
            <p className="bank-recon-pair__title">{tx.planName || tx.category || tx.note || 'Lançamento'}</p>
            <p className="text-xs text-muted">
              {fmtDate(tx.settledAt || tx.createdAt)} · {fmtMoney(tx.gross)}
              {tx.lead_id ? (
                <>
                  {' '}
                  · <Link to={`/student/${tx.lead_id}`}>Aluno</Link>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <p className="text-small text-muted">Sem lançamento vinculado</p>
        )}
      </div>
      <div className="bank-recon-pair__actions">
        {onConfirm && tx ? (
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void onConfirm()}>
            <Check size={14} /> Confirmar
          </button>
        ) : null}
        {onIgnore ? (
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => void onIgnore()}>
            Ignorar
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function ReconciliationTab({ academyId }) {
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualTxId, setManualTxId] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [completeNote, setCompleteNote] = useState('');
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await listBankStatements(academyId);
      setStatements(body.statements || []);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, 'load'));
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  const loadDetail = useCallback(
    async (id) => {
      if (!academyId || !id) return;
      setDetailLoading(true);
      setError('');
      try {
        const body = await getBankStatementDetail(academyId, id);
        setDetail(body);
      } catch (e) {
        console.error(e);
        setError(friendlyError(e, 'load'));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [academyId]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const grouped = useMemo(() => {
    if (!detail?.items) return { auto: [], suggested: [], unmatched: [], ignored: [] };
    const txById = new Map((detail.navi_transactions || []).map((t) => [t.id, t]));
    const auto = [];
    const suggested = [];
    const unmatched = [];
    const ignored = [];

    for (const item of detail.items) {
      if (item.status === 'ignored') {
        ignored.push(item);
        continue;
      }
      if (item.status === 'matched') {
        auto.push({ item, tx: txById.get(item.matched_tx_id) });
        continue;
      }
      if (item.suggested_tx_id && item.match_score >= 50 && item.match_score < 85) {
        suggested.push({ item, tx: txById.get(item.suggested_tx_id) });
        continue;
      }
      unmatched.push({ item, tx: null });
    }
    return { auto, suggested, unmatched, ignored };
  }, [detail]);

  const refresh = async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  };

  const onImported = (statementId) => {
    setSelectedId(statementId);
    void refresh();
  };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      console.error(e);
      setError(String(e?.message || friendlyError(e, 'action')));
    } finally {
      setBusy(false);
    }
  };

  if (!academyId) return null;

  if (!selectedId) {
    return (
      <section className="mt-4 bank-recon">
        <StatusBanner variant="info" className="finance-tab-intro">
          Importe o extrato do banco (OFX ou CSV), confira sugestões automáticas e vincule cada linha a um lançamento
          do Caixa. Itens sem correspondência podem gerar um novo lançamento ou ser ignorados.
        </StatusBanner>
        <div className="flex justify-between items-center gap-2 mb-3 bank-recon-list-head">
          <button type="button" className="btn-primary" onClick={() => setShowImport(true)}>
            <Upload size={16} className="bank-recon-btn-icon" />
            Importar extrato
          </button>
        </div>

        {loading ? <PageSkeleton variant="table" rows={4} columns={5} /> : null}
        {error ? <p className="text-small bank-recon-error">{error}</p> : null}

        {!loading && statements.length === 0 ? (
          <div className="card bank-recon-empty-card">
            <p className="text-muted">Nenhum extrato importado ainda.</p>
          </div>
        ) : null}

        {!loading && statements.length > 0 ? (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Período</th>
                  <th>Importado em</th>
                  <th className="finance-num">Créditos</th>
                  <th className="finance-num">Débitos</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id}>
                    <td>{s.filename || '—'}</td>
                    <td>
                      {fmtDate(s.period_start)} — {fmtDate(s.period_end)}
                    </td>
                    <td>{fmtDate(String(s.import_date || '').slice(0, 10))}</td>
                    <td className="finance-num">{fmtMoney(s.total_credit)}</td>
                    <td className="finance-num">{fmtMoney(s.total_debit)}</td>
                    <td>
                      <span className={STATUS_BADGE_CLASS[s.status] || 'finance-badge-neutro'}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-outline btn-sm" onClick={() => setSelectedId(s.id)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <ImportStatementModal
          academyId={academyId}
          open={showImport}
          onClose={() => setShowImport(false)}
          onImported={onImported}
        />
      </section>
    );
  }

  const summary = detail?.summary || {};
  const st = detail?.statement;

  return (
    <section className="mt-4 bank-recon">
      <button type="button" className="btn-outline btn-sm mb-3" onClick={() => setSelectedId('')}>
        <ArrowLeft size={14} className="bank-recon-btn-icon bank-recon-btn-icon--back" />
        Voltar aos extratos
      </button>

      {detailLoading ? <PageSkeleton variant="cards" rows={2} /> : null}

      {st && !detailLoading ? (
        <>
          <div className="card bank-recon-summary mb-3" role="status">
            <h4 className="funil-section-subheading bank-recon-summary-title">
              {st.filename} · {STATUS_LABELS[st.status] || st.status}
            </h4>
            <p className="text-small text-muted bank-recon-summary-period">
              {fmtDate(st.period_start)} — {fmtDate(st.period_end)}
            </p>
            <div className="bank-recon-summary__grid">
              <div>
                <span className="text-xs text-muted">Conciliados</span>
                <strong className="bank-recon-summary-value bank-recon-summary-value--ok">
                  {summary.reconciled_count} ({fmtMoney(summary.reconciled_amount)})
                </strong>
              </div>
              <div>
                <span className="text-xs text-muted">Pendentes</span>
                <strong className="bank-recon-summary-value bank-recon-summary-value--warn">
                  {summary.pending_count} ({fmtMoney(summary.pending_amount)})
                </strong>
              </div>
              <div>
                <span className="text-xs text-muted">Diferença</span>
                <strong className="bank-recon-summary-value">{fmtMoney(summary.difference)}</strong>
              </div>
              <div>
                <span className="text-xs text-muted">Nave sem extrato</span>
                <strong className="bank-recon-summary-value">{summary.navi_orphan_count}</strong>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-3 bank-recon-actions-head">
            {grouped.auto.length > 0 ? (
              <button
                type="button"
                className="btn-outline btn-sm"
                disabled={busy || st.status === 'reconciled'}
                onClick={() => run(() => confirmAllBankMatches(academyId, st.id))}
              >
                Confirmar todos ({grouped.auto.length})
              </button>
            ) : null}
          </div>

          <div className="bank-recon-columns">
            <div className="bank-recon-col">
              <h4 className="funil-section-subheading">Extrato bancário</h4>

              {grouped.auto.length > 0 ? (
                <p className="text-xs text-muted mb-2">Matches automáticos (≥85%)</p>
              ) : null}
              {grouped.auto.map(({ item, tx }) => (
                <MatchRow
                  key={item.id}
                  item={item}
                  tx={tx}
                  tone="auto"
                  busy={busy}
                  onConfirm={
                    item.status !== 'matched'
                      ? () => run(() => confirmBankMatch(academyId, { item_id: item.id, transaction_id: tx?.id }))
                      : null
                  }
                />
              ))}

              {grouped.suggested.length > 0 ? (
                <p className="text-xs text-muted mb-2 mt-3">Sugestões (50–84%)</p>
              ) : null}
              {grouped.suggested.map(({ item, tx }) => (
                <MatchRow
                  key={item.id}
                  item={item}
                  tx={tx}
                  tone="suggested"
                  busy={busy}
                  onConfirm={() =>
                    run(() =>
                      confirmBankMatch(academyId, {
                        item_id: item.id,
                        transaction_id: item.suggested_tx_id || tx?.id,
                      })
                    )
                  }
                  onIgnore={() => run(() => ignoreBankItem(academyId, item.id))}
                />
              ))}

              {grouped.unmatched.length > 0 ? (
                <p className="text-xs text-muted mb-2 mt-3">Sem correspondência</p>
              ) : null}
              {grouped.unmatched.map(({ item }) => (
                <div key={item.id} className="bank-recon-pair bank-recon-pair--unmatched">
                  <div className="bank-recon-pair__bank">
                    <p className="bank-recon-pair__title">{item.description}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(item.date)} · {fmtMoney(item.amount)}
                    </p>
                  </div>
                  <div className="bank-recon-pair__actions">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => run(() => createTxFromBankItem(academyId, { item_id: item.id }))}
                    >
                      <Plus size={14} /> Criar lançamento
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => run(() => ignoreBankItem(academyId, item.id))}
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bank-recon-col">
              <h4 className="funil-section-subheading">Lançamentos Nave</h4>
              <p className="text-xs text-muted mb-2">Liquidados no período ainda não conciliados</p>
              {(detail.navi_unmatched || []).length === 0 ? (
                <p className="text-small text-muted">Nenhum lançamento pendente de conferência.</p>
              ) : (
                (detail.navi_unmatched || []).map((tx) => (
                  <div key={tx.id} className="bank-recon-navi-row">
                    <div>
                      <p className="bank-recon-pair__title">{tx.planName || tx.category || 'Lançamento'}</p>
                      <p className="text-xs text-muted">
                        {fmtDate(tx.settledAt)} · {tx.direction === 'out' ? 'Saída' : 'Entrada'} ·{' '}
                        {fmtMoney(tx.gross)}
                      </p>
                    </div>
                  </div>
                ))
              )}

              <div className="card mt-3 bank-recon-manual-card">
                <p className="text-xs text-muted mb-2">Conferir manualmente (sem linha no extrato)</p>
                <select
                  className="form-input mb-2"
                  value={manualTxId}
                  onChange={(e) => setManualTxId(e.target.value)}
                >
                  <option value="">Selecione lançamento…</option>
                  {(detail.navi_unmatched || []).map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {fmtDate(tx.settledAt)} — {fmtMoney(tx.gross)} — {tx.planName || tx.category}
                    </option>
                  ))}
                </select>
                <textarea
                  className="form-input mb-2"
                  rows={2}
                  placeholder="Justificativa (obrigatória)"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy || !manualTxId || !manualNote.trim()}
                  onClick={() =>
                    run(() =>
                      manualReconcileTx(academyId, {
                        transaction_id: manualTxId,
                        statement_id: st.id,
                        justification: manualNote,
                      })
                    )
                  }
                >
                  Marcar como conferido
                </button>
              </div>
            </div>
          </div>

          {st.status !== 'reconciled' ? (
            <div className="card mt-4 bank-recon-complete-card">
              <h4 className="funil-section-subheading bank-recon-complete-title">
                Finalizar conciliação
              </h4>
              <textarea
                className="form-input mb-2"
                rows={2}
                placeholder="Observações sobre diferenças não resolvidas (opcional)"
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    completeBankReconciliation(academyId, {
                      statement_id: st.id,
                      completion_note: completeNote,
                    })
                  )
                }
              >
                Finalizar conciliação
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="text-small mt-2 bank-recon-error">{error}</p> : null}
    </section>
  );
}
