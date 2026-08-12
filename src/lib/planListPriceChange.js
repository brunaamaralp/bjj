import { formatBRL } from './moneyBr.js';
import { isActiveStudent } from './studentStatus.js';

function planPriceNumber(plan) {
  const n = Number(plan?.price);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function planIsExempt(plan) {
  return plan?.isExempt === true;
}

function effectiveListPrice(plan) {
  if (planIsExempt(plan)) return 0;
  return planPriceNumber(plan);
}

/**
 * Diferenças de preço de lista / isenção entre planos salvos e o draft, por índice.
 * Planos novos (além do comprimento salvo) são ignorados.
 */
export function detectPlanListPriceChanges(savedPlans, nextPlans) {
  const saved = Array.isArray(savedPlans) ? savedPlans : [];
  const next = Array.isArray(nextPlans) ? nextPlans : [];
  const changes = [];
  const limit = Math.min(saved.length, next.length);

  for (let i = 0; i < limit; i += 1) {
    const from = saved[i] || {};
    const to = next[i] || {};
    const fromExempt = planIsExempt(from);
    const toExempt = planIsExempt(to);
    const fromPrice = planPriceNumber(from);
    const toPrice = planPriceNumber(to);
    const priceChanged = fromPrice !== toPrice;
    const exemptChanged = fromExempt !== toExempt;
    const effectiveChanged = effectiveListPrice(from) !== effectiveListPrice(to);

    if (!priceChanged && !exemptChanged && !effectiveChanged) continue;

    const name = String(to.name || from.name || '').trim() || 'Plano';
    changes.push({
      index: i,
      name,
      fromPrice,
      toPrice,
      fromExempt,
      toExempt,
    });
  }

  return changes;
}

export function countStudentsOnPlan(students, planName, { activeOnly = true } = {}) {
  const target = String(planName || '').trim();
  if (!target) return 0;
  const list = Array.isArray(students) ? students : [];
  let count = 0;
  for (const s of list) {
    if (String(s?.plan || '').trim() !== target) continue;
    if (activeOnly && !isActiveStudent(s)) continue;
    count += 1;
  }
  return count;
}

function formatListPriceLabel(price, exempt) {
  if (exempt) return 'Isento';
  return formatBRL(price);
}

/**
 * @param {Array} changes
 * @param {Record<string, number>} countsByPlanName
 * @param {{ countsReliable?: boolean }} options
 */
export function buildPlanPriceChangeConfirmCopy(changes, countsByPlanName = {}, options = {}) {
  const countsReliable = options.countsReliable === true;
  const list = Array.isArray(changes) ? changes : [];
  const title = list.length > 1 ? 'Confirmar novos preços de lista' : 'Confirmar novo preço de lista';

  if (list.length === 0) {
    return { title, description: '' };
  }

  const formatChange = (c) => {
    const fromLabel = formatListPriceLabel(c.fromPrice, c.fromExempt);
    const toLabel = formatListPriceLabel(c.toPrice, c.toExempt);
    return `«${c.name}» passa de ${fromLabel} para ${toLabel}`;
  };

  let studentsPart;
  if (countsReliable) {
    if (list.length === 1) {
      const n = Number(countsByPlanName[list[0].name]) || 0;
      studentsPart =
        n === 1
          ? '1 aluno neste plano mantém o valor acordado no perfil.'
          : `${n} alunos neste plano mantêm o valor acordado no perfil.`;
    } else {
      let total = 0;
      for (const c of list) {
        total += Number(countsByPlanName[c.name]) || 0;
      }
      studentsPart =
        total === 1
          ? '1 aluno nesses planos mantém o valor acordado no perfil.'
          : `${total} alunos nesses planos mantêm o valor acordado no perfil.`;
    }
  } else {
    studentsPart = 'Alunos já matriculados neste plano mantêm o valor acordado no perfil.';
  }

  const head =
    list.length === 1
      ? `O preço de lista de ${formatChange(list[0])}.`
      : `${list.length} planos com preço de lista alterado: ${list.map(formatChange).join('; ')}.`;

  const description = `${head} ${studentsPart} O novo preço vale só para matrículas novas.`;
  return { title, description };
}
