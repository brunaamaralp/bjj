/** Rótulo e tom do badge de sync Control iD na lista de alunos. */

export function resolveControlIdSyncBadgeMeta(student, blockOverdueAccess = false) {
  const overdue = student?.overdue === true;
  if (blockOverdueAccess && overdue) {
    return {
      label: 'Catraca: bloqueado',
      tone: 'danger',
      title: 'Inadimplente — acesso bloqueado na catraca',
      canSync: false,
    };
  }

  const err = String(student?.controlid_sync_error || '').trim();
  const synced = student?.controlid_synced === true;
  const photo = String(student?.photo_url || '').trim();

  if (err) {
    return { label: 'Catraca: erro', tone: 'danger', title: err, canSync: true };
  }
  if (synced) {
    return { label: 'Catraca: OK', tone: 'success', title: 'Sincronizado com a catraca', canSync: false };
  }
  if (photo) {
    return { label: 'Catraca: pendente', tone: 'warning', title: 'Clique para sincronizar', canSync: true };
  }
  return { label: 'Sem foto', tone: 'muted', title: 'Envie foto no perfil para sincronizar', canSync: false };
}
