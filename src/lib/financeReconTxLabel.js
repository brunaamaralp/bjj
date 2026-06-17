import { parseCompetenceMonth } from './financeCompetence.js';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** YYYY-MM → "Jun/2026" */
export function formatCompetenceMonthShort(ym) {
  const parsed = parseCompetenceMonth(ym);
  if (!parsed) return '';
  const [, y, m] = parsed.match(/^(\d{4})-(\d{2})$/) || [];
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return '';
  return `${MONTH_SHORT[idx]}/${y}`;
}

/**
 * planName em FINANCIAL_TX espelhado a partir de mensalidade.
 * @param {{ studentName?: string, planName?: string, refMonth?: string }} opts
 */
export function buildMirrorPlanName({ studentName, planName, refMonth } = {}) {
  const name = String(studentName || '').trim();
  const plan = String(planName || '').trim();
  if (name && plan) return `${name} — ${plan}`.slice(0, 256);
  if (name) return name.slice(0, 256);
  if (plan) return plan.slice(0, 256);
  const ref = parseCompetenceMonth(refMonth);
  return ref ? `Mensalidade ${ref}`.slice(0, 256) : 'Pagamento';
}

function subjectIncludesLead(subject, leadName) {
  const subj = String(subject || '').trim().toLowerCase();
  const lead = String(leadName || '').trim().toLowerCase();
  if (!subj || !lead) return false;
  if (subj.includes(lead)) return true;
  const firstToken = lead.split(/\s+/)[0];
  return firstToken.length >= 3 && subj.includes(firstToken);
}

function isGenericMensalidadeLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'mensalidade' || text === 'mensalidades';
}

/** Título curto para pareamento na conciliação (sem data/valor). */
export function formatReconTxShortTitle(tx) {
  if (!tx) return 'Lançamento';

  const leadName = String(tx.lead_name || '').trim();
  const planName = String(tx.planName || '').trim();
  const category = String(tx.category || '').trim();
  const note = String(tx.note || '').trim();
  const txType = String(tx.type || '').trim();
  const competence = formatCompetenceMonthShort(tx.competence_month);
  const subject = planName || category || note || 'Lançamento';

  const genericMensalidade =
    txType === 'plan' ||
    isGenericMensalidadeLabel(category) ||
    (isGenericMensalidadeLabel(planName) && !planName.includes('—'));

  if (genericMensalidade && leadName) {
    const parts = [`Mensalidade — ${leadName}`];
    if (competence) parts.push(competence);
    return parts.join(' — ');
  }

  const parts = [];
  if (leadName && !subjectIncludesLead(subject, leadName)) {
    parts.push(leadName);
  }
  parts.push(subject);
  if (competence && !subject.includes(competence)) {
    parts.push(competence);
  }
  return parts.join(' — ');
}

/**
 * Label completo para seletor / toast (data + valor + título).
 * @param {object} tx
 * @param {{ formatDate?: (ymd: string) => string, formatMoney?: (n: number) => string }} formatters
 */
export function formatReconTxSelectLabel(tx, formatters = {}) {
  if (!tx) return 'Lançamento';
  const formatDate =
    formatters.formatDate ||
    ((ymd) => {
      const p = String(ymd || '').slice(0, 10).split('-');
      if (p.length !== 3) return '—';
      return `${p[2]}/${p[1]}/${p[0]}`;
    });
  const formatMoney =
    formatters.formatMoney ||
    ((v) => {
      try {
        return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      } catch {
        return `R$ ${Number(v || 0).toFixed(2)}`;
      }
    });

  const settled = tx.settledAt || tx.createdAt || '';
  return `${formatDate(settled)} — ${formatMoney(tx.gross)} — ${formatReconTxShortTitle(tx)}`;
}

/** Rótulo de confiança do matcher (conciliação bancária). */
export function matchTierLabel(tier) {
  if (tier === 'amount_date_name') return 'Alta (valor + data + nome)';
  if (tier === 'amount_date') return 'Média (valor + data)';
  if (tier === 'amount_approx') return 'Baixa (valor aproximado)';
  return '';
}
