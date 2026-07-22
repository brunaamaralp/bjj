import '../../styles/recepcao-kimono-loans.css';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Search, Settings2, Shirt, Undo2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuItemStatic,
  DropdownMenuPanel,
} from '../shared/menu';

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
  if (loan.borrower_type === KIMONO_BORROWER_TYPES.LEAD) {
    return `/lead/${loan.borrower_id}`;
  }
  return null;
}

function loanSourceLabel(source) {
  const s = String(source || '').toLowerCase();
  if (s === 'sale') return 'PDV';
  if (s === 'reception') return 'Recepção';
  if (s === 'inventory') return 'Estoque';
  return '';
}

function KimonoLoanLendModal({ open, onClose, variants, onSubmit, submitting, initialVariantId = '' }) {
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
      return;
    }
    const preset = String(initialVariantId || '');
    setVariantId(preset && variants.some((v) => v.id === preset) ? preset : '');
  }, [open, initialVariantId, variants]);

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
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ available: 0, out: 0 });
  const [overdueHours, setOverdueHours] = useState(DEFAULT_KIMONO_LOAN_OVERDUE_HOURS);
  const [overdueCount, setOverdueCount] = useState(0);
  const [lendOpen, setLendOpen] = useState(false);
  const [lendPresetVariantId, setLendPresetVariantId] = useState('');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [returningId, setReturningId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(String(DEFAULT_KIMONO_LOAN_OVERDUE_HOURS));
  const [collectionMissing, setCollectionMissing] = useState(false);
  const inventoryListboxId = useId();

  const enabled = modules?.inventory === true || modules?.sales === true;

  const openLendModal = useCallback((variantId = '') => {
    setLendPresetVariantId(variantId || '');
    setInventoryOpen(false);
    setInventoryQuery('');
    setLendOpen(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!academyId || !enabled || collectionMissing) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchKimonoLoanBoard();
      setLoans(data.loans || []);
      setVariants(data.variants || []);
      setInventory(data.inventory || data.variants || []);
      setTotals(data.totals || { available: 0, out: 0 });
      setOverdueHours(data.settings?.overdueHours ?? DEFAULT_KIMONO_LOAN_OVERDUE_HOURS);
      setSettingsDraft(String(data.settings?.overdueHours ?? DEFAULT_KIMONO_LOAN_OVERDUE_HOURS));
      setOverdueCount(Number(data.overdueCount) || 0);
      setCollectionMissing(false);
    } catch (e) {
      if (e?.code === 'kimono_loans_collection_missing') {
        setCollectionMissing(true);
      }
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [academyId, enabled, collectionMissing]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !academyId || collectionMissing) return undefined;
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [enabled, academyId, collectionMissing, refresh]);

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

  const availableInventory = useMemo(
    () => inventory.filter((item) => item.rental_available > 0),
    [inventory]
  );

  const filteredAvailableInventory = useMemo(() => {
    const q = inventoryQuery.trim().toLowerCase();
    if (!q) return availableInventory;
    return availableInventory.filter((item) => String(item.label || '').toLowerCase().includes(q));
  }, [availableInventory, inventoryQuery]);

  if (!enabled) return null;

  return (
    <section className="kimono-loan-panel reception-section animate-in" aria-labelledby="kimono-loan-heading">
      <div className="reception-section-head kimono-loan-panel__head">
        <div className="kimono-loan-panel__title-wrap">
          <h2 id="kimono-loan-heading" className="reception-section-heading">
            <Shirt size={18} aria-hidden />
            Kimonos
          </h2>
          {overdueCount > 0 ? (
            <span className="kimono-loan-panel__overdue-badge" role="status">
              <AlertTriangle size={14} aria-hidden />
              {overdueCount} em atraso
            </span>
          ) : null}
        </div>
        <button type="button" className="btn-primary kimono-loan-panel__lend-btn" onClick={() => openLendModal()}>
          <Plus size={16} aria-hidden />
          Emprestar
        </button>
      </div>

      <div className="kimono-loan-panel__summary" role="status">
        <span className="kimono-loan-panel__summary-stat">
          <strong>{totals.available}</strong> disponíve{totals.available === 1 ? 'l' : 'is'}
        </span>
        <span className="kimono-loan-panel__summary-dot" aria-hidden>
          ·
        </span>
        <span className="kimono-loan-panel__summary-stat">
          <strong>{loans.length}</strong> emprestado{loans.length === 1 ? '' : 's'}
        </span>
      </div>

      {error ? <StatusBanner variant="error" title={error} className="kimono-loan-panel__error" /> : null}

      {!loading && variants.length === 0 && enabled ? (
        <div className="kimono-loan-panel__empty-catalog">
          <p className="text-small text-muted">
            Nenhum item de aluguel cadastrado. Cadastre kimonos na Loja para emprestar pela recepção.
          </p>
          <Link to="/loja?tab=aluguel" className="btn-secondary btn-sm kimono-loan-panel__setup-link">
            Cadastrar em Loja → Aluguel
          </Link>
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted text-small kimono-loan-panel__loading">Carregando kimonos…</p>
      ) : (
        <>
          <div className="kimono-loan-panel__block">
            <h3 className="kimono-loan-panel__subheading">Disponíveis para empréstimo</h3>
            {availableInventory.length === 0 ? (
              <p className="text-muted text-small kimono-loan-panel__empty">
                Nenhum kimono disponível no armário.
              </p>
            ) : (
              <DropdownMenu
                open={inventoryOpen}
                onOpenChange={setInventoryOpen}
                align="start"
                className="kimono-loan-inventory-search"
              >
                <div className="kimono-loan-inventory-search__field">
                  <Search size={16} aria-hidden className="kimono-loan-inventory-search__icon" />
                  <input
                    id="kimono-inventory-search"
                    className="form-input kimono-loan-inventory-search__input"
                    type="search"
                    value={inventoryQuery}
                    autoComplete="off"
                    placeholder="Buscar tamanho ou peça…"
                    aria-label="Buscar kimono disponível"
                    aria-expanded={inventoryOpen}
                    aria-controls={inventoryListboxId}
                    aria-haspopup="listbox"
                    onFocus={() => setInventoryOpen(true)}
                    onChange={(e) => {
                      setInventoryQuery(e.target.value);
                      setInventoryOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setInventoryOpen(true);
                      }
                    }}
                  />
                </div>
                {inventoryOpen ? (
                  <DropdownMenuPanel
                    id={inventoryListboxId}
                    role="listbox"
                    aria-label="Kimonos disponíveis"
                    className="kimono-loan-inventory-search__panel"
                  >
                    {filteredAvailableInventory.length === 0 ? (
                      <DropdownMenuItemStatic className="text-muted text-small">
                        Nenhum tamanho encontrado.
                      </DropdownMenuItemStatic>
                    ) : (
                      filteredAvailableInventory.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          role="option"
                          className="kimono-loan-inventory-search__option"
                          onClick={() => openLendModal(item.id)}
                        >
                          <span className="kimono-loan-inventory-search__option-label">{item.label}</span>
                          <span className="kimono-loan-inventory-search__option-count">
                            {item.rental_available} disp.
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuPanel>
                ) : null}
              </DropdownMenu>
            )}
          </div>

          <div className="kimono-loan-panel__block">
            <h3 className="kimono-loan-panel__subheading">Emprestados agora</h3>
            {loans.length === 0 ? (
              <p className="text-muted text-small kimono-loan-panel__empty">
                Nenhum kimono emprestado no momento.
              </p>
            ) : (
              <ul className="kimono-loan-list">
                {loans.map((loan) => (
                  <li
                    key={loan.id}
                    className={`kimono-loan-list__item${loan.overdue ? ' kimono-loan-list__item--overdue' : ''}`}
                  >
                    <div className="kimono-loan-list__main">
                      {borrowerProfileHref(loan) ? (
                        <Link to={borrowerProfileHref(loan)} className="kimono-loan-list__name">
                          {loan.borrower_name}
                        </Link>
                      ) : (
                        <span className="kimono-loan-list__name">{loan.borrower_name}</span>
                      )}
                      <span className="kimono-loan-list__meta text-small text-muted">
                        {loan.item_label || loan.size_label}
                        {loanSourceLabel(loan.source) ? ` · ${loanSourceLabel(loan.source)}` : ''} · saiu às{' '}
                        {formatLentTime(loan.lent_at)} · {loan.elapsed_label}
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
          </div>
        </>
      )}

      <details className="kimono-loan-panel__settings-details">
        <summary className="kimono-loan-panel__settings-summary">
          <Settings2 size={14} aria-hidden />
          Alerta de atraso
        </summary>
        <div className="kimono-loan-panel__settings">
          <label className="text-small" htmlFor="kimono-overdue-hours">
            Alertar após (horas)
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
          <span className="text-small text-muted">Atual: {overdueHours}h</span>
        </div>
      </details>

      <KimonoLoanLendModal
        open={lendOpen}
        onClose={() => setLendOpen(false)}
        variants={variants}
        initialVariantId={lendPresetVariantId}
        onSubmit={handleLend}
        submitting={submitting}
      />
    </section>
  );
}
