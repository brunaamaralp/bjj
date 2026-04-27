/**
 * Atualização otimista da lista de conversas (comportamento espelhado do Inbox).
 */

export function mapConversationItemsAfterRead(items, phone) {
  const p = String(phone || '').trim();
  const arr = Array.isArray(items) ? items : [];
  return arr.map((it) => {
    const ph = String(it?.phone_number || '').trim();
    if (ph !== p) return it;
    return { ...it, unread_count: 0, last_read_at: new Date().toISOString() };
  });
}

export function mapConversationItemsAfterUnread(items, phone) {
  const p = String(phone || '').trim();
  const arr = Array.isArray(items) ? items : [];
  return arr.map((it) => {
    const ph = String(it?.phone_number || '').trim();
    if (ph !== p) return it;
    const cur = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
    return { ...it, unread_count: Math.max(1, cur) };
  });
}

/** Query string da listagem: '1' arquivadas, '0' padrão (não arquivadas). */
export function conversationsArchivedQueryValue(archivedListFilter) {
  return archivedListFilter === 'archived' ? '1' : '0';
}

/**
 * Modo de filtro Appwrite para o campo archived (lista conversas).
 * Padrão: notEqual(archived, true) para incluir null/false.
 */
export function describeArchivedListFilter(archivedOnly) {
  return archivedOnly ? 'equal:archived:true' : 'notEqual:archived:true';
}
