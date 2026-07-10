import '../../styles/recepcao-kimono-loans.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Shirt, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { friendlyError } from '../../lib/errorMessages.js';
import {
  fetchKimonoLoanBoard,
  lendKimonoApi,
  returnKimonoApi,
  saveKimonoLoanSettingsApi,
} from '../../lib/kimonoLoanApi.js';
import { searchStudentsForSaleApi } from '../../lib/studentsApi.js';
import { DEFAULT_KIMONO_LOAN_OVERDUE_HOURS } from '../../lib/kimonoLoanSettings.js';
import { KIMONO_BORROWER_TYPES } from '../../lib/kimonoLoanCore.js';
import StatusBanner from '../shared/StatusBanner.jsx';
import FieldError from '../shared/FieldError.jsx';
import Hint from '../shared/Hint.jsx';

function formatLentTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function borrowerProfileHref(loan) {
  if (loan.borrower_type === KIMONO_BORROWER_TYPES.STUDENT) {
    return `/student/${loan.borrower_id}`;
  }
  return `/lead/${loan.borrower_id}`;
}

function KimonoLoanLendModal({ open, onClose, variants, onSubmit, submitting }) {
  const leads = useLeadStore((s) => s.leads);
  const academyId = useLeadStore((s) => s.academyId);

  const [borrowerKind, setBorrowerKind] = useState('lead');
  const [query, setQuery] = useState('');
  const [studentHits, setStudentHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [variantId, setVariantId] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) {
      setBorrowerKind('lead');
      setQuery('');
      setStudentHits([]);
      setSelected(null);
      setVariantId('');
      setFieldErrors({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || borrowerKind !== 'student') return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setStudentHits([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchStudentsForSaleApi(q, academyId, { limit: 8 });
        if (!cancelled) setStudentHits(hits);
      } catch {
        if (!cancelled) setStudentHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, borrowerKind, query, academyId]);

  const leadHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (borrowerKind !== 'lead' || q.length < 2) return [];
    return (leads || [])
      .filter((l) => {
        const name = String(l.name || '').toLowerCase();
        const phone = String(l.phone || '').replace(/\D/g, '');
        const qq = q.replace(/\D/g, '');
        return name.includes(q) || (qq.length >= 4 && phone.includes(qq));
      })
      .slice(0, 8);
  }, [borrowerKind, query, leads]);

  const hits = borrowerKind === 'student' ? studentHits : leadHits;

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!selected?.id) errs.borrower = 'Selecione lead ou aluno.';
    if (!variantId) errs.variant = 'Escolha o tamanho.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({
      borrower_type: borrowerKind === 'student' ? KIMONO_BORROWER_TYPES.STUDENT : KIMONO_BORROWER_TYPES.LEAD,
      borrower_id: selected.id,
      borrower_name: selected.name,
      variant_id: variantId,
    });
  };

  if (!open) return null;

  return (
    <div className="kimono-loan-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="kimono-loan-modal card"
        role="dialog"
        aria-labelledby="kimono-loan-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kimono-loan-modal-title" className="kimono-loan-modal__title">
          Emprestar kimono
        </h2>
        <form onSubmit={handleSubmit} className="kimono-loan-modal__form">
          <div className="kimono-loan-modal__tabs" role="tablist" aria-label="Tipo de pessoa">
            <button
              type="button"
              role="tab"
              aria-selected={borrowerKind === 'lead'}
              className={borrowerKind === 'lead' ? 'is-active' : ''}
              onClick={() => {
                setBorrowerKind('lead');
                setSelected(null);
                setQuery('');
              }}
            >
              Lead
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={borrowerKind === 'student'}
              className={borrowerKind === 'student' ? 'is-active' : ''}
              onClick={() => {
                setBorrowerKind('student');
                setSelected(null);
                setQuery('');
              }}
            >
              Aluno
            </button>
          </div>

          <label className="form-label" htmlFor="kimono-borrower-search">
            Buscar por nome ou telefone
          </label>
          <input
            id="kimono-borrower-search"
            className="form-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder={borrowerKind === 'lead' ? 'Ex.: Carla ou 11999…' : 'Ex.: João ou 11988…'}
            autoComplete="off"
          />
          <FieldError message={fieldErrors.borrower} />

          {selected ? (
            <p className="kimono-loan-modal__selected text-small">
              <Check size={14} aria-hidden /> {selected.name}
              <button type="button" className="kimono-loan-modal__clear" onClick={() => setSelected(null)}>
                Trocar
              </button>
            </p>
          ) : (
            <ul className="kimono-loan-modal__hits">
              {searching ? (
                <li className="text-muted text-small">Buscando…</li>
              ) : hits.length ? (
                hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="kimono-loan-modal__hit"
                      onClick={() =>
                        setSelected({
                          id: h.id,
                          name: h.name || h.nome || '—',
                        })
                      }
                    >
                      <span>{h.name || h.nome}</span>
                      {h.phone ? <span className="text-muted">{h.phone}</span> : null}
                    </button>
                  </li>
                ))
              ) : query.trim().length >= 2 ? (
                <li className="text-muted text-small">Nenhum resultado.</li>
              ) : null}
            </ul>
          )}

          <label className="form-label" htmlFor="kimono-variant">
            Tamanho / peça
          </label>
          <select
            id="kimono-variant"
            className="form-input"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.rental_available} disp.)
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.variant} />
          {!variants.length ? (
            <Hint>Nenhuma peça de aluguel disponível. Cadastre kimonos tipo aluguel no estoque.</Hint>
          ) : null}

          <div className="kimono-loan-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !variants.length}>
              {submitting ? <Loader2 size={16} className="spin-refresh" aria-hidden /> : null}
              Confirmar empréstimo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function KimonoLoanPanel({ academyId, modules }) {
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loans, setLoans] = useState([]);
  const [variants, setVariants] = useState([]);
  const [overdueHours, setOverdueHours] = useState(DEFAULT_KIMONO_LOAN_OVERDUE_HOURS);
  const [overdueCount, setOverdueCount] = useState(0);
  const [lendOpen, setLendOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [returningId, setReturningId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(String(DEFAULT_KIMONO_LOAN_OVERDUE_HOURS));

  const enabled = modules?.inventory === true || modules?.sales === true;

  const refresh = useCallback(async () => {
    if (!academyId || !enabled) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchKimonoLoanBoard();
      setLoans(data.loans || []);
      setVariants(data.variants || []);
      setOverdueHours(data.settings?.overdueHours ?? DEFAULT_KIMONO_LOAN_OVERDUE_HOURS);
      setSettingsDraft(String(data.settings?.overdueHours ?? DEFAULT_KIMONO_LOAN_OVERDUE_HOURS));
      setOverdueCount(Number(data.overdueCount) || 0);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      if (e?.code === 'kimono_loans_collection_missing') {
        setError('Empréstimos ainda não provisionados no banco (coleção kimono_loans).');
      }
    } finally {
      setLoading(false);
    }
  }, [academyId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !academyId) return undefined;
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [enabled, academyId, refresh]);

  const handleLend = async (payload) => {
    setSubmitting(true);
    try {
      await lendKimonoApi(payload);
      addToast({ type: 'success', message: 'Kimono emprestado.' });
      setLendOpen(false);
      await refresh();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (loanId) => {
    setReturningId(loanId);
    try {
      await returnKimonoApi(loanId);
      addToast({ type: 'success', message: 'Devolução registrada.' });
      await refresh();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setReturningId('');
    }
  };

  const handleSaveSettings = async () => {
    const h = Math.trunc(Number(settingsDraft));
    if (!Number.isFinite(h) || h < 1 || h > 72) {
      addToast({ type: 'error', message: 'Informe entre 1 e 72 horas.' });
      return;
    }
    setSavingSettings(true);
    try {
      const data = await saveKimonoLoanSettingsApi(h);
      setOverdueHours(data.settings?.overdueHours ?? h);
      addToast({ type: 'success', message: 'Alerta de atraso atualizado.' });
      await refresh();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingSettings(false);
    }
  };

  if (!enabled) return null;

  return (
    <section className="kimono-loan-panel reception-section animate-in" aria-labelledby="kimono-loan-heading">
      <div className="reception-section-head kimono-loan-panel__head">
        <div className="kimono-loan-panel__title-wrap">
          <h2 id="kimono-loan-heading" className="reception-section-heading">
            <Shirt size={18} aria-hidden />
            Kimonos emprestados
          </h2>
          {overdueCount > 0 ? (
            <span className="kimono-loan-panel__overdue-badge" role="status">
              <AlertTriangle size={14} aria-hidden />
              {overdueCount} em atraso
            </span>
          ) : null}
        </div>
        <button type="button" className="btn-primary kimono-loan-panel__lend-btn" onClick={() => setLendOpen(true)}>
          <Plus size={16} aria-hidden />
          Emprestar
        </button>
      </div>

      <div className="kimono-loan-panel__settings">
        <label className="text-small" htmlFor="kimono-overdue-hours">
          Alerta após (horas)
        </label>
        <input
          id="kimono-overdue-hours"
          type="number"
          min={1}
          max={72}
          className="form-input kimono-loan-panel__hours-input"
          value={settingsDraft}
          onChange={(e) => setSettingsDraft(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={savingSettings || String(overdueHours) === settingsDraft.trim()}
          onClick={() => void handleSaveSettings()}
        >
          {savingSettings ? 'Salvando…' : 'Salvar'}
        </button>
        <span className="text-small text-muted">Padrão: {overdueHours}h</span>
      </div>

      {error ? <StatusBanner variant="error" title={error} className="kimono-loan-panel__error" /> : null}

      {loading ? (
        <p className="text-muted text-small kimono-loan-panel__loading">Carregando empréstimos…</p>
      ) : loans.length === 0 ? (
        <p className="text-muted text-small">Nenhum kimono emprestado no momento.</p>
      ) : (
        <ul className="kimono-loan-list">
          {loans.map((loan) => (
            <li
              key={loan.id}
              className={`kimono-loan-list__item${loan.overdue ? ' kimono-loan-list__item--overdue' : ''}`}
            >
              <div className="kimono-loan-list__main">
                <Link to={borrowerProfileHref(loan)} className="kimono-loan-list__name">
                  {loan.borrower_name}
                </Link>
                <span className="kimono-loan-list__meta text-small text-muted">
                  {loan.item_label || loan.size_label} · saiu às {formatLentTime(loan.lent_at)} ·{' '}
                  {loan.elapsed_label}
                </span>
                {loan.overdue ? (
                  <span className="kimono-loan-list__alert text-small">
                    <AlertTriangle size={12} aria-hidden /> Passou de {overdueHours}h sem devolução
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-secondary kimono-loan-list__return-btn"
                disabled={returningId === loan.id}
                onClick={() => void handleReturn(loan.id)}
              >
                {returningId === loan.id ? (
                  <Loader2 size={14} className="spin-refresh" aria-hidden />
                ) : (
                  <Undo2 size={14} aria-hidden />
                )}
                Devolver
              </button>
            </li>
          ))}
        </ul>
      )}

      <KimonoLoanLendModal
        open={lendOpen}
        onClose={() => setLendOpen(false)}
        variants={variants}
        onSubmit={handleLend}
        submitting={submitting}
      />
    </section>
  );
}
