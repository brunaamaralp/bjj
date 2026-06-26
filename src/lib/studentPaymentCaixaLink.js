import { Link } from 'react-router-dom';
import { shouldMirrorPaymentToCaixa } from './paymentStatus.js';

const FINANCEIRO_TX_PATH = '/financeiro?tab=movimentacoes';

const CAIXA_BADGE_STYLE = {
  display: 'inline-block',
  marginTop: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  textDecoration: 'none',
};

/** Badge/link reutilizável (meta de paymentCaixaMeta / saleCaixaMeta). */
export function CaixaLinkBadge({ meta }) {
  if (!meta) return null;
  const style = {
    ...CAIXA_BADGE_STYLE,
    background: meta.tone === 'warning' ? '#FEF3C7' : 'var(--v50, var(--azul-gelo))',
    color: meta.tone === 'warning' ? '#B45309' : 'var(--v700, var(--petroleo))',
  };
  if (meta.href) {
    return (
      <Link to={meta.href} style={style}>
        {meta.label}
      </Link>
    );
  }
  return (
    <span style={style} title="Use Verificar espelhos na conciliação bancária">
      {meta.label}
    </span>
  );
}

/** Badge/link Caixa para pagamento do aluno (nunca para status covered). */
export function paymentCaixaMeta(payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return null;
  if (!shouldMirrorPaymentToCaixa(st)) return null;

  if (payment?.financial_tx_sync_pending) {
    return { label: 'Caixa pendente', tone: 'warning', href: null };
  }

  const txId = String(payment?.financial_tx_id || '').trim();
  if (!txId) return null;

  const label =
    st === 'pending' || st === 'awaiting' ? 'A receber no Caixa' : 'No Caixa';

  return {
    label,
    tone: st === 'pending' || st === 'awaiting' ? 'warning' : 'success',
    href: `${FINANCEIRO_TX_PATH}&tx=${encodeURIComponent(txId)}`,
  };
}

/** Badge/link Caixa para venda de produto vinculada ao aluno. */
export function saleCaixaMeta(sale) {
  const st = String(sale?.status || '').toLowerCase();
  if (st === 'cancelada') return null;

  const txId = String(sale?.financial_tx_id || '').trim();
  if (txId) {
    return {
      label: st === 'pendente' ? 'A receber no Caixa' : 'No Caixa',
      tone: st === 'pendente' ? 'warning' : 'success',
      href: `${FINANCEIRO_TX_PATH}&tx=${encodeURIComponent(txId)}`,
    };
  }

  const shortId = String(sale?.id_short || sale?.id || '').trim();
  if (!shortId) return null;

  return {
    label: st === 'pendente' ? 'A receber no Caixa' : 'No Caixa',
    tone: st === 'pendente' ? 'warning' : 'success',
    href: `${FINANCEIRO_TX_PATH}&q=${encodeURIComponent(shortId)}`,
  };
}
