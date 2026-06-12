import React, { useEffect, useState } from 'react';
import { fetchBillingPayments } from '../../../lib/billingApi';

const STATUS_LABEL = {
  CONFIRMED: 'Pago',
  PENDING: 'Pendente',
  OVERDUE: 'Vencido',
};

const BILLING_LABEL = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão',
};

function formatMoney(value) {
  const n = parseFloat(String(value || '0').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso.slice(0, 10);
  }
}

export default function InvoiceHistoryTable({ storeId, billingLive, refreshKey = 0 }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId || !billingLive) {
      setLoading(false);
      setPayments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchBillingPayments(storeId)
      .then((d) => {
        if (!cancelled) setPayments(Array.isArray(d.payments) ? d.payments : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Erro ao carregar faturas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [storeId, billingLive, refreshKey]);

  if (!billingLive) return null;

  return (
    <section className="billing-invoices" style={{ marginTop: 28 }}>
      <h3 className="navi-section-title" style={{ fontSize: '1rem', marginBottom: 12 }}>Histórico de faturas</h3>
      {loading && (
        <div className="billing-invoices-skeleton" aria-hidden>
          <div /><div /><div />
        </div>
      )}
      {!loading && error && (
        <p className="navi-subtitle" style={{ color: 'var(--danger)' }}>{error}</p>
      )}
      {!loading && !error && payments.length === 0 && (
        <p className="navi-subtitle">Nenhuma fatura ainda.</p>
      )}
      {!loading && payments.length > 0 && (
        <div className="billing-invoices-table-wrap">
          <table className="billing-invoices-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor</th>
                <th>Forma</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paidAt || p.dueDate)}</td>
                  <td>{formatMoney(p.value)}</td>
                  <td>{BILLING_LABEL[p.billingType] || p.billingType}</td>
                  <td>{STATUS_LABEL[p.status] || p.status}</td>
                  <td>
                    {p.invoiceUrl ? (
                      <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="edit-link">
                        Ver fatura
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
