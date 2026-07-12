import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { listFinanceTx } from '../../lib/financeTxApi.js';
import { buildFinanceLancamentosPath } from '../../lib/financeiroHubTabs.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { displayGross, displayNet, txDirection } from '../../lib/financeTxDisplay.js';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';
import { fmt } from '../finance/financeFmt.js';
import './reports.css';

const DRILL_TITLES = {
  received: 'Recebimentos no período',
  expenses: 'Despesas no período',
};

function txRowLabel(tx) {
  return (
    String(tx.category || '').trim() ||
    String(tx.planName || '').trim() ||
    String(tx.lead_name || '').trim() ||
    String(tx.note || '').trim() ||
    'Lançamento'
  );
}

function txRowAmount(tx) {
  const dir = txDirection(tx);
  const typeLc = String(tx.type || '').toLowerCase();
  if (dir === 'out') return displayGross(tx);
  if (typeLc === 'refund') {
    const rawNet = Number(tx.net);
    return Number.isFinite(rawNet) && rawNet !== 0 ? rawNet : -displayGross(tx);
  }
  return displayNet(tx);
}

function formatDrillDate(tx) {
  const iso = tx.settledAt || tx.createdAt;
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ReportsFinanceDrillDialog({
  drillKey,
  academyId,
  from,
  to,
  regime,
  onClose,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  const direction = drillKey === 'expenses' ? 'out' : drillKey === 'received' ? 'in' : '';

  useEffect(() => {
    if (!drillKey || !academyId || !from || !to) {
      setRows([]);
      setError('');
      setTruncated(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError('');
    listFinanceTx({
      academyId,
      from,
      to,
      regime,
      direction,
      status: 'settled',
      limit: 50,
    })
      .then((body) => {
        if (!active) return;
        setRows(Array.isArray(body?.transactions) ? body.transactions : []);
        setTruncated(Boolean(body?.truncated) || Boolean(body?.hasMore));
      })
      .catch((e) => {
        if (!active) return;
        setError(friendlyError(e, 'load'));
        setRows([]);
        setTruncated(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drillKey, academyId, from, to, regime, direction]);

  const total = useMemo(
    () => rows.reduce((sum, tx) => sum + Math.abs(Number(txRowAmount(tx)) || 0), 0),
    [rows]
  );

  const title = DRILL_TITLES[drillKey] || 'Lançamentos no período';
  const lancamentosPath = buildFinanceLancamentosPath({ from, to, regime });

  return (
    <ModalShell
      open={Boolean(drillKey)}
      title={title}
      onClose={onClose}
      maxWidth={520}
      dialogClassName="reports-drill-modal reports-drill-modal--accent"
      ariaLabelledBy="reports-finance-drill-title"
      footer={
        <Link to={lancamentosPath} className="btn-outline btn-sm" onClick={onClose}>
          Abrir em Lançamentos
        </Link>
      }
    >
      <p className="text-xs text-muted reports-drill-meta-line">
        {loading
          ? 'Carregando…'
          : `${rows.length} lançamento${rows.length === 1 ? '' : 's'} · total ${fmt(total)} · ${from} — ${to}`}
      </p>
      {truncated && !loading ? (
        <p className="reports-panel-note" role="status">
          Mostrando os primeiros 50 lançamentos. Abra Lançamentos para ver a lista completa.
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          variant="compact"
          tone="dashed"
          title="Nenhum lançamento neste filtro"
          description="Tente ajustar o período ou o regime de visualização."
          role="status"
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <ul className="reports-finance-drill-list">
          {rows.map((tx) => (
            <li key={tx.id} className="reports-finance-drill-row">
              <span className="reports-finance-drill-row__date">{formatDrillDate(tx)}</span>
              <span className="reports-finance-drill-row__desc">{txRowLabel(tx)}</span>
              <span className="reports-finance-drill-row__meta">
                {formatPaymentMethod(tx.method)}
              </span>
              <span className="reports-finance-drill-row__value">{fmt(txRowAmount(tx))}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </ModalShell>
  );
}
