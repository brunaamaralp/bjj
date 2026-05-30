const MAX_VISIBLE_ATTRIBUTE_PILLS = 2;

/** Pills de atributo do lead (hot, intenção, etc.) para exibição compacta no card. */
export function collectLeadAttributePills(lead) {
  const pills = [];
  if (lead?.hotLead) pills.push({ key: 'hot', label: '🔥' });
  if (lead?.needHuman) pills.push({ key: 'human', label: 'Precisa resposta' });
  if (lead?.intention) pills.push({ key: 'intention', label: String(lead.intention) });
  if (lead?.priority) pills.push({ key: 'priority', label: String(lead.priority) });
  return pills;
}

export function partitionLeadAttributePills(lead) {
  const all = collectLeadAttributePills(lead);
  const visible = all.slice(0, MAX_VISIBLE_ATTRIBUTE_PILLS);
  const hiddenCount = Math.max(0, all.length - visible.length);
  return { visible, hiddenCount, all };
}
