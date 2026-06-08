import { LEAD_STATUS } from '../store/useLeadStore';
import { formatInboxPhone } from './inboxContactDisplay.js';
import { parseInboxTimestampMs } from './inboxTimestamps.js';

/**
 * @param {object} params
 * @param {unknown[]} params.items
 * @param {Map} params.leadById
 * @param {Map} params.leadByPhone
 * @param {Record<string, number>} params.highlighted
 * @param {(phone: string) => string} params.normalizePhone
 * @param {(args: object) => string} params.pickDisplayName
 */
export function enrichInboxListItems({
  items,
  leadById,
  leadByPhone,
  highlighted,
  normalizePhone,
  pickDisplayName,
}) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((it) => {
    const phone = String(it?.phone_number || '').trim();
    const leadId = String(it?.lead_id || '').trim();
    const leadFromId = leadId ? leadById.get(leadId) : null;
    const leadFromPhone = phone ? leadByPhone.get(normalizePhone(phone)) : null;
    const lead = leadFromId || leadFromPhone;
    const leadName = String(lead?.name || '').trim() || String(it?.lead_name || '').trim();
    const manualContactName = String(it?.contact_name || '').trim();
    const waProfileName = String(it?.whatsapp_profile_name || '').trim();
    const waProfileImageUrl = String(it?.whatsapp_profile_image_url || '').trim();
    const displayTitle = pickDisplayName({ leadName, manualContactName, whatsappProfileName: waProfileName, phone });
    const lastRole = String(it?.last_message_role || '').trim() || '';
    const lastSender = String(it?.last_message_sender || '').trim() || '';
    const unreadCount = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
    const handoffActive = Boolean(it?.need_human);
    const aiSuggestHuman = Boolean(lead?.needHuman);
    const hotLead = Boolean(lead?.hotLead);
    const priority = String(lead?.priority || '').trim();
    const intention = String(lead?.intention || '').trim();
    const status = String(lead?.status || '').trim();
    const contactType =
      String(lead?.contact_type || '').trim() ||
      (status === LEAD_STATUS.CONVERTED ? 'student' : 'lead');
    const ticketStatus = String(it?.ticket_status || '').trim() || 'open';
    const transferTo = String(it?.transfer_to || '').trim();
    return {
      ...it,
      _phone: phone,
      _displayTitle: displayTitle,
      _displaySubtitle:
        displayTitle && phone && displayTitle !== phone ? formatInboxPhone(phone) : '',
      _leadName: leadName,
      _manualContactName: manualContactName,
      _waProfileName: waProfileName,
      _profileImageUrl: waProfileImageUrl,
      _lead: lead || null,
      _hotLead: hotLead,
      _handoffActive: handoffActive,
      _aiSuggestHuman: aiSuggestHuman,
      _needsHuman: handoffActive,
      _priority: priority,
      _intention: intention,
      _status: status,
      _contactType: contactType,
      _lastRole: lastRole,
      _lastSender: lastSender,
      _unreadCount: unreadCount,
      _ticketStatus: ticketStatus,
      _transferTo: transferTo,
      _archived: Boolean(it?.archived),
      _hasLinkedLead: Boolean(String(it?.lead_id || '').trim()),
      _pipelineStage: String(lead?.pipelineStage || '').trim(),
      _isHighlighted: Boolean(
        highlighted &&
          typeof highlighted === 'object' &&
          highlighted[phone] &&
          Number(highlighted[phone]) > Date.now()
      ),
    };
  });
}

export function sortInboxByActivity(items) {
  const arr = Array.isArray(items) ? items : [];
  const activityMs = (it) => {
    const u = parseInboxTimestampMs(it?.updated_at);
    if (u) return u;
    return parseInboxTimestampMs(it?.last_message_timestamp);
  };
  return arr.slice().sort((a, b) => activityMs(b) - activityMs(a));
}

function unreadCountOf(it) {
  const n = Number(it?._unreadCount ?? it?.unread_count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normTicket(it) {
  return String(it?._ticketStatus ?? it?.ticket_status ?? '')
    .trim()
    .toLowerCase();
}

export function filterInboxListItems(prioritizedItems, listFilter) {
  const arr = Array.isArray(prioritizedItems) ? prioritizedItems : [];
  if (listFilter === 'needs_me') {
    return arr.filter((it) => Boolean(it?._handoffActive));
  }

  const f = String(listFilter || 'all');
  let result = arr;
  if (f === 'archived') result = arr.filter((it) => Boolean(it?.archived));
  else if (f === 'unread') result = arr.filter((it) => unreadCountOf(it) > 0);
  else if (f === 'hot') result = arr.filter((it) => Boolean(it?._hotLead));
  else if (f === 'need_human') result = arr.filter((it) => Boolean(it?._handoffActive));
  else if (f === 'waiting_customer') result = arr.filter((it) => normTicket(it) === 'waiting_customer');
  else if (f === 'resolved') result = arr.filter((it) => normTicket(it) === 'resolved');
  else if (f === 'transferred') result = arr.filter((it) => normTicket(it) === 'transferred');

  if (f === 'all') {
    const updatedMs = (it) => {
      const u = parseInboxTimestampMs(it?.updated_at);
      if (u) return u;
      return parseInboxTimestampMs(it?.last_message_timestamp);
    };
    const unreadRank = (it) => (unreadCountOf(it) > 0 ? 0 : 1);
    result = result.slice().sort((a, b) => {
      const ru = unreadRank(a) - unreadRank(b);
      if (ru !== 0) return ru;
      return updatedMs(b) - updatedMs(a);
    });
  }
  return result;
}

/**
 * Filtro client-side por nome ou telefone parcial (sobre itens já carregados).
 * Complementa a busca por telefone no servidor quando há ≥2 dígitos.
 */
export function filterInboxListBySearch(items, searchQuery, normalizePhone) {
  const arr = Array.isArray(items) ? items : [];
  const q = String(searchQuery || '').trim();
  if (!q) return arr;
  const qLower = q.toLowerCase();
  const qDigits = typeof normalizePhone === 'function' ? normalizePhone(q) : q.replace(/\D/g, '');
  return arr.filter((it) => {
    const phone = String(it?._phone || it?.phone_number || '').trim();
    const phoneDigits =
      typeof normalizePhone === 'function' ? normalizePhone(phone) : phone.replace(/\D/g, '');
    if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) return true;
    const nameFields = [
      it?._displayTitle,
      it?._leadName,
      it?._manualContactName,
      it?._waProfileName,
    ]
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean);
    return nameFields.some((name) => name.includes(qLower));
  });
}

export function groupInboxListItems(filteredItems) {
  const arr = Array.isArray(filteredItems) ? filteredItems : [];
  const isResolvedTicket = (it) => normTicket(it) === 'resolved';
  const unread = [];
  const resolved = [];
  const open = [];
  for (const it of arr) {
    const u = unreadCountOf(it);
    if (u > 0) unread.push(it);
    else if (isResolvedTicket(it)) resolved.push(it);
    else open.push(it);
  }
  return [
    { key: 'unread', label: 'Não lidas', items: unread },
    { key: 'open', label: 'Em atendimento', items: open },
    { key: 'resolved', label: 'Resolvidas', items: resolved },
  ];
}

export function flattenInboxGroups(groupedFilteredItems) {
  const groups = Array.isArray(groupedFilteredItems) ? groupedFilteredItems : [];
  const out = [];
  for (const g of groups) {
    const raw = Array.isArray(g?.items) ? g.items : [];
    for (const it of raw) out.push(it);
  }
  return out;
}

export function firstVisibleInboxConversation(groupedFilteredItems) {
  const groups = Array.isArray(groupedFilteredItems) ? groupedFilteredItems : [];
  for (const g of groups) {
    const raw = Array.isArray(g?.items) ? g.items : [];
    for (const it of raw) {
      const phone = String(it?._phone || it?.phone_number || '').trim();
      if (phone) return it;
    }
  }
  return null;
}
