import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Query } from 'appwrite';
import { databases, DB_ID, JOURNAL_COL } from '../../lib/appwrite.js';
import {
  resolveTxJournalMirror,
  txJournalMirrorStatusMessage,
  mapJournalDoc,
  findJournalEntryForTx,
} from '../../lib/financeTxJournalMirror.js';
import { buildEmpresaFinanceRazaoPath } from '../../lib/financeiroHubTabs.js';
import StatusBanner from '../shared/StatusBanner.jsx';

function mirrorSummaryHint(mirror, hasLines) {
  if (hasLines) {
    const n = mirror.rows?.length || 0;
    return n === 1 ? '1 linha' : `${n} linhas`;
  }
  return txJournalMirrorStatusMessage(mirror.state);
}

function MirrorSkeleton() {
  return (
    <div
      className="finance-tx-drawer-mirror__skeleton"
      role="status"
      aria-busy="true"
      aria-label="Carregando espelho contábil"
    >
      <span className="finance-tx-drawer-mirror__skeleton-line" />
      <span className="finance-tx-drawer-mirror__skeleton-line finance-tx-drawer-mirror__skeleton-line--short" />
    </div>
  );
}

function MirrorTable({ rows, preview }) {
  return (
    <table
      className={
        preview
          ? 'finance-tx-drawer-mirror__table finance-tx-drawer-mirror__table--preview'
          : 'finance-tx-drawer-mirror__table'
      }
    >
      <thead>
        <tr>
          <th scope="col" aria-label="Tipo" />
          <th scope="col">Conta</th>
          <th scope="col" className="finance-num">
            Valor
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            <td>
              <span
                className={`finance-tx-drawer-mirror__side finance-tx-drawer-mirror__side--${row.side}`}
                aria-label={row.side === 'debit' ? 'Débito' : 'Crédito'}
              >
                {row.sideLabel}
              </span>
            </td>
            <td>
              {row.accountCode ? (
                <span className="finance-tx-drawer-mirror__account-code">{row.accountCode}</span>
              ) : null}
              {row.accountName}
            </td>
            <td
              className={`finance-num finance-tx-drawer-mirror__amount finance-tx-drawer-mirror__amount--${row.side}`}
            >
              {row.amountFormatted}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FinanceTxJournalMirrorSection({
  tx,
  academyId,
  chartAccounts,
  journalEntries = [],
}) {
  const txId = String(tx?.id || tx?.$id || '').trim();
  const status = String(tx?.status || '').toLowerCase();

  return (
    <JournalMirrorBody
      key={txId}
      tx={tx}
      txId={txId}
      status={status}
      academyId={academyId}
      chartAccounts={chartAccounts}
      journalEntries={journalEntries}
    />
  );
}

function JournalMirrorBody({ tx, txId, status, academyId, chartAccounts, journalEntries }) {
  const needsFetch = Boolean(
    txId &&
      status === 'settled' &&
      academyId &&
      JOURNAL_COL &&
      !findJournalEntryForTx(journalEntries, txId)
  );
  const [fetchedEntry, setFetchedEntry] = useState(null);
  const [fetching, setFetching] = useState(needsFetch);

  const mergedEntries = useMemo(() => {
    const list = [...(journalEntries || [])];
    if (fetchedEntry && !list.some((e) => e.id === fetchedEntry.id)) {
      list.unshift(fetchedEntry);
    }
    return list;
  }, [journalEntries, fetchedEntry]);

  useEffect(() => {
    if (!needsFetch) return undefined;

    let active = true;
    databases
      .listDocuments(DB_ID, JOURNAL_COL, [
        Query.equal('academyId', academyId),
        Query.equal('financial_tx_id', txId),
        Query.limit(1),
      ])
      .then((res) => {
        if (!active) return;
        const doc = (res.documents || [])[0];
        setFetchedEntry(doc ? mapJournalDoc(doc) : null);
      })
      .catch(() => {
        if (active) setFetchedEntry(null);
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [needsFetch, txId, academyId]);

  const mirror = useMemo(
    () =>
      resolveTxJournalMirror({
        tx,
        accounts: chartAccounts,
        journalEntries: mergedEntries,
        academyId,
      }),
    [tx, chartAccounts, mergedEntries, academyId]
  );

  const hasLines = (mirror.rows || []).length > 0;
  const summaryHint = mirrorSummaryHint(mirror, hasLines);
  const razaoPath = buildEmpresaFinanceRazaoPath({ from: 'tx', txId });
  const defaultOpen = mirror.state === 'post_missing' && status === 'settled';

  return (
    <details
      className="finance-tx-drawer-mirror-details"
      open={defaultOpen || undefined}
    >
      <summary className="finance-tx-drawer-mirror__summary">
        <span className="finance-tx-drawer-mirror__summary-main">
          <h3 id="finance-tx-mirror-heading" className="finance-tx-drawer-mirror__title">
            Espelho contábil
          </h3>
          {mirror.state === 'posted' ? (
            <span className="finance-badge-pago finance-tx-drawer-mirror__badge">Gravado</span>
          ) : null}
          {mirror.state === 'preview' ? (
            <span className="finance-badge-projetado finance-tx-drawer-mirror__badge">Previsto</span>
          ) : null}
        </span>
        {summaryHint ? (
          <span className="finance-tx-drawer-mirror__summary-meta text-small text-muted">{summaryHint}</span>
        ) : null}
        <ChevronDown size={16} className="finance-tx-drawer-mirror__chevron" aria-hidden />
      </summary>

      <div className="finance-tx-drawer-mirror__body" aria-labelledby="finance-tx-mirror-heading">
        {fetching && !hasLines ? <MirrorSkeleton /> : null}

        {hasLines ? <MirrorTable rows={mirror.rows} preview={mirror.state === 'preview'} /> : null}

        {hasLines && mirror.state === 'preview' ? (
          <p className="finance-tx-drawer-mirror__hint text-small text-muted" role="status">
            Ainda não gravado no razão.
          </p>
        ) : null}

        {mirror.state === 'post_missing' && status === 'settled' && !hasLines ? (
          <StatusBanner variant="warning" className="finance-tx-drawer-mirror__banner">
            {txJournalMirrorStatusMessage('post_missing')}
          </StatusBanner>
        ) : null}

        <p className="finance-tx-drawer-mirror__link-wrap">
          <Link to={razaoPath} className="finance-tx-drawer-mirror__link">
            Ver razão
          </Link>
        </p>
      </div>
    </details>
  );
}
