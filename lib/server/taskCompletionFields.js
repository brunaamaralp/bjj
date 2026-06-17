export function actorDisplayName(me) {
  return String(me?.name || me?.email || 'Usuário').trim() || 'Usuário';
}

/** Preenche ou limpa completed_by* quando status muda para/de done. */
export function applyTaskCompletionFields(patch, current, me) {
  if (!Object.prototype.hasOwnProperty.call(patch, 'status')) return patch;
  const prevStatus = String(current?.status || '').trim().toLowerCase();
  const nextStatus = String(patch.status || '').trim().toLowerCase();
  const out = { ...patch };

  if (prevStatus !== 'done' && nextStatus === 'done') {
    out.completed_by = String(me?.$id || '').trim();
    out.completed_by_name = actorDisplayName(me);
  } else if (prevStatus === 'done' && nextStatus !== 'done') {
    out.completed_by = '';
    out.completed_by_name = '';
  }

  return out;
}
