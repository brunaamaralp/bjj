import {
  hotLeadDisplayLabel,
  intentionDisplayLabel,
  needHumanDisplayLabel,
  priorityDisplayLabel,
} from './whatsappClassificationLabels.js';

const MAX_VISIBLE_ATTRIBUTE_PILLS = 2;

/**
 * Pills de atributo do lead (hot, intenção, etc.) para exibição compacta no card.
 * @param {object|null|undefined} lead
 * @param {{ terms?: object, vertical?: string }} [opts]
 */
export function collectLeadAttributePills(lead, opts = {}) {
  const pills = [];
  if (lead?.hotLead) pills.push({ key: 'hot', label: hotLeadDisplayLabel(true) || '🔥' });
  if (lead?.needHuman) {
    const humanLabel = needHumanDisplayLabel(true);
    if (humanLabel) pills.push({ key: 'human', label: humanLabel });
  }
  if (lead?.intention) {
    const label = intentionDisplayLabel(lead.intention, opts);
    if (label) pills.push({ key: 'intention', label });
  }
  if (lead?.priority) {
    const label = priorityDisplayLabel(lead.priority);
    if (label) pills.push({ key: 'priority', label });
  }
  return pills;
}

export function partitionLeadAttributePills(lead, opts = {}) {
  const all = collectLeadAttributePills(lead, opts);
  const visible = all.slice(0, MAX_VISIBLE_ATTRIBUTE_PILLS);
  const hiddenCount = Math.max(0, all.length - visible.length);
  return { visible, hiddenCount, all };
}
