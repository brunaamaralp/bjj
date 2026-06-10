import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, Lock, Unlock } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import { parseMaskToCents, formatBRLFromCents, formatBRL } from '../../lib/moneyBr';
import { paymentFormLabel } from '../../lib/salePayments.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  fetchOpenCashShift,
  openCashShift,
  closeCashShift,
} from '../../lib/salesCashShiftApi';

export default function CashShiftBanner({
  academyId,
  requireShift = false,
  pdvMode = false,
  onShiftChange,
  blockSales = false,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCents, setOpeningCents] = useState(0);
  const [closingCashCents, setClosingCashCents] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!academyId) {
      setShift(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const body = await fetchOpenCashShift();
      setShift(body.shift || null);
      onShiftChange?.(body.shift || null);
    } catch (e) {
      console.error('[CashShift]', e);
      setShift(null);
      onShiftChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, onShiftChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!requireShift || loading || shift) return;
    if (pdvMode) setOpenModal(true);
  }, [requireShift, loading, shift, pdvMode]);

  const handleOpen = async () => {
    setBusy(true);
    try {
      const body = await openCashShift({ opening_balance: (openingCents || 0) / 100 });
      setShift(body.shift);
      onShiftChange?.(body.shift);
      setOpenModal(false);
      addToast({ type: 'success', message: 'Caixa aberto.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    setBusy(true);
    try {
      const counted = { dinheiro: (closingCashCents || 0) / 100 };
      const body = await closeCashShift({
        counted_totals: counted,
        closing_balance: counted.dinheiro,
        notes: closeNotes,
      });
      setShift(null);
      onShiftChange?.(null);
      setCloseModal(false);
      const diff = body.shift?.difference;
      if (diff != null && Math.abs(diff) > 0.009) {
        addToast({
          type: 'warning',
          message: `Caixa fechado. Diferença em dinheiro: ${formatBRL(diff)}`,
        });
      } else {
        addToast({ type: 'success', message: 'Caixa fechado.' });
      }
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setBusy(false);
    }
  };

  if (!academyId || loading) return null;

  const expected = shift?.expected_totals_live || shift?.expected_totals || {};
  const expectedCash =
    Number(shift?.opening_balance || 0) + Number(expected.dinheiro || 0);

  return (
    <>
      <div
        className={`sales-cash-shift-banner${shift ? ' sales-cash-shift-banner--open' : ''}${
          blockSales && requireShift && !shift ? ' sales-cash-shift-banner--blocked' : ''
        }`}
        role="status"
      >
        <Wallet size={18} aria-hidden />
        {shift ? (
          <>
            <span>
              Caixa aberto desde{' '}
              {new Date(shift.opened_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {shift.opened_by_name ? ` · ${shift.opened_by_name}` : ''}
            </span>
            <button type="button" className="btn-outline sales-cash-shift-banner__btn" onClick={() => setCloseModal(true)}>
              <Lock size={14} aria-hidden />
              Fechar caixa
            </button>
          </>
        ) : (
          <>
            <span>{requireShift ? 'Abra o caixa para registrar vendas.' : 'Nenhum turno de caixa aberto.'}</span>
            <button type="button" className="btn-primary sales-cash-shift-banner__btn" onClick={() => setOpenModal(true)}>
              <Unlock size={14} aria-hidden />
              Abrir caixa
            </button>
          </>
        )}
      </div>

      <ModalShell open={openModal} title="Abrir caixa" onClose={() => !busy && setOpenModal(false)} size="sm">
        <div className="form-group">
          <label>Valor inicial em dinheiro (gaveta)</label>
          <input
            type="text"
            className="form-input"
            value={formatBRLFromCents(openingCents)}
            onChange={(e) => setOpeningCents(parseMaskToCents(e.target.value))}
          />
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => setOpenModal(false)}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleOpen()}>
            {busy ? 'Abrindo…' : 'Abrir caixa'}
          </button>
        </div>
      </ModalShell>

      <ModalShell open={closeModal} title="Fechar caixa" onClose={() => !busy && setCloseModal(false)} size="md">
        <div className="text-small" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          <div>
            <strong>Esperado em dinheiro:</strong> {formatBRL(expectedCash)}
          </div>
          {Object.keys(expected).length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <strong>Por forma (vendas do turno):</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {Object.entries(expected).map(([forma, val]) => (
                  <li key={forma}>
                    {paymentFormLabel(forma)}: {formatBRL(val)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="form-group">
          <label>Dinheiro contado na gaveta</label>
          <input
            type="text"
            className="form-input"
            value={formatBRLFromCents(closingCashCents)}
            onChange={(e) => setClosingCashCents(parseMaskToCents(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label>Observações (opcional)</label>
          <input
            type="text"
            className="form-input"
            maxLength={512}
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => setCloseModal(false)}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleClose()}>
            {busy ? 'Fechando…' : 'Fechar caixa'}
          </button>
        </div>
      </ModalShell>
    </>
  );
}
