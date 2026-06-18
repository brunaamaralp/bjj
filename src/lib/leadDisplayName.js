const CHILD_TYPES = new Set(['Criança', 'Juniores']);

function trim(v) {
  return String(v ?? '').trim();
}

function normalizePhoneDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function foldSearchText(v) {
  return trim(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isLeadChildProfile(lead) {
  return CHILD_TYPES.has(trim(lead?.type));
}

export function leadCardPrimaryName(lead) {
  const name = trim(lead?.name);
  return name || 'Sem nome';
}

export function leadCardGuardianSubtitle(lead) {
  if (!isLeadChildProfile(lead)) return '';
  const student = trim(lead?.name);
  const guardian = trim(lead?.parentName);
  if (!guardian) return '';
  if (guardian.toLowerCase() === student.toLowerCase()) return '';
  return `resp. ${guardian}`;
}

export function leadCardTooltip(lead) {
  const primary = leadCardPrimaryName(lead);
  const guardian = trim(lead?.parentName);
  if (isLeadChildProfile(lead) && guardian && guardian.toLowerCase() !== primary.toLowerCase()) {
    return `${primary} · ${guardian}`;
  }
  return primary === 'Sem nome' ? '' : primary;
}

export function leadProfileNameFieldLabel(lead) {
  return isLeadChildProfile(lead) ? 'Nome do aluno' : 'Nome';
}

export function leadProfileNeedsGuardianHint(lead) {
  return isLeadChildProfile(lead) && !trim(lead?.parentName);
}

export function leadMatchesKanbanSearch(lead, rawQuery) {
  const q = foldSearchText(rawQuery);
  const qPhone = normalizePhoneDigits(rawQuery);
  if (!q && !qPhone) return true;

  const name = foldSearchText(lead?.name);
  const parent = foldSearchText(lead?.parentName);
  const phoneNorm = normalizePhoneDigits(lead?.phone);

  if (qPhone && phoneNorm.includes(qPhone)) return true;
  if (q && name.includes(q)) return true;
  if (q && parent.includes(q)) return true;
  return false;
}
