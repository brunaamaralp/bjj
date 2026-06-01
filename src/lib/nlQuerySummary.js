function formatRefMonth(ym) {
  if (!ym) return '';
  try {
    const s = String(ym).trim();
    const cap = new Date(`${s}-02`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return cap.replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return ym;
  }
}

const SUMMARY_BY_TYPE = {
  enrolled_in_month: (n, month) =>
    `${n} matrícula${n === 1 ? '' : 's'} em ${formatRefMonth(month) || '—'}`,
  unpaid_tuition: (n, month) =>
    `${n} aluno${n === 1 ? '' : 's'} com mensalidade em aberto em ${formatRefMonth(month) || '—'}`,
  overdue_tuition: (n, month) =>
    `${n} inadimplente${n === 1 ? '' : 's'} em ${formatRefMonth(month) || '—'}`,
  new_leads: (n) => `${n} lead${n === 1 ? '' : 's'} novo${n === 1 ? '' : 's'}`,
  attended_experimental: (n) =>
    `${n} compareceu${n === 1 ? '' : 'ram'} à experimental`,
  scheduled_experimental: (n) =>
    `${n} experimental${n === 1 ? '' : 'is'} agendada${n === 1 ? '' : 's'}`,
  missed_experimental: (n) =>
    `${n} faltou${n === 1 ? '' : 'ram'} à experimental`,
  lost_leads: (n) => `${n} lead${n === 1 ? '' : 's'} perdido${n === 1 ? '' : 's'}`,
  pipeline_stage: (n) => `${n} lead${n === 1 ? '' : 's'} nesta etapa`,
};

/**
 * Linha de resumo amigável para consultas read-only com lista (academy_query / inventory_query).
 * @param {{ count?: number, query_type?: string, reference_month?: string, resposta?: string }} data
 */
export function buildNlQuerySummary(data = {}) {
  const count = Number(data.count ?? data.rows?.length ?? 0);
  const queryType = String(data.query_type || '').trim();
  const month = String(data.reference_month || '').trim();
  const fn = SUMMARY_BY_TYPE[queryType];
  if (fn && count >= 0) return fn(count, month);

  const firstLine = String(data.resposta || '').split('\n')[0].trim();
  if (firstLine) return firstLine.replace(/:\s*$/, '');
  return count > 0 ? `${count} resultado(s)` : 'Nenhum resultado';
}

/**
 * Texto markdown para exibir quando não há tabela (ex.: finance_summary, estoque).
 * @param {{ resposta?: string }} data
 */
export function nlQueryMarkdownBody(data = {}) {
  const raw = String(data.resposta || '').trim();
  if (!raw) return '';
  const lines = raw.split('\n');
  const first = lines[0]?.trim() || '';
  if (lines.length <= 1) return raw;
  const rest = lines.slice(1).join('\n').trim();
  if (!rest) return raw;
  if (/^[-*•]\s/m.test(rest) || /^\d+\.\s/m.test(rest)) {
    return `${first.replace(/:\s*$/, '')}\n\n${rest.replace(/^•\s/gm, '- ')}`;
  }
  return raw;
}
