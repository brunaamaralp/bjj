import {
  formatWhatsAppGroupLabel,
  isWhatsAppGroupId,
  rawWhatsAppChatId,
} from './whatsappGroupId.js';

export function normalizeWhatsAppPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function isZapsterGroupParty(party, idFallback = '') {
  if (party && typeof party === 'object') {
    if (String(party.type || '').trim().toLowerCase() === 'group') return true;
  }
  const id = rawWhatsAppChatId(party) || String(idFallback || '').trim();
  return isWhatsAppGroupId(id);
}

function partyName(party) {
  if (!party || typeof party !== 'object') return '';
  return String(party.name || party.subject || '').trim();
}

function partyProfilePicture(party) {
  if (!party || typeof party !== 'object') return '';
  const u = String(party.profile_picture || party.profilePicture || '').trim();
  return u && /^https?:\/\//i.test(u) ? u : '';
}

/**
 * Contexto de grupo a partir do payload Zapster (message.received / message.sent).
 * @returns {null | { groupId, groupName, groupPicture, participantPhone, participantName }}
 */
export function extractWhatsAppGroupContext(msg) {
  if (!msg || typeof msg !== 'object') return null;

  const sender = msg.sender && typeof msg.sender === 'object' ? msg.sender : null;
  const recipient = msg.recipient && typeof msg.recipient === 'object' ? msg.recipient : null;

  const recipientIsGroup = isZapsterGroupParty(recipient, msg?.recipient?.id ?? msg?.to);
  const senderIsGroup = isZapsterGroupParty(sender, msg?.sender?.id ?? msg?.from);

  if (!recipientIsGroup && !senderIsGroup) return null;

  const groupParty = recipientIsGroup ? recipient : sender;
  const participantParty = recipientIsGroup ? sender : recipient;
  const groupRaw =
    rawWhatsAppChatId(groupParty) ||
    (recipientIsGroup ? msg?.recipient?.id ?? msg?.to : msg?.sender?.id ?? msg?.from);
  const groupId = normalizeWhatsAppPhone(groupRaw);
  if (!groupId) return null;

  return {
    groupId,
    groupName: partyName(groupParty) || formatWhatsAppGroupLabel(groupId),
    groupPicture: partyProfilePicture(groupParty),
    participantPhone: normalizeWhatsAppPhone(rawWhatsAppChatId(participantParty)),
    participantName: partyName(participantParty),
  };
}

/** Campos extras por mensagem inbound em thread de grupo. */
export function groupParticipantMessageFields({ participantName = '', participantPhone = '' } = {}) {
  const out = {};
  const name = String(participantName || '').trim();
  const phone = normalizeWhatsAppPhone(participantPhone);
  if (name) out.sender_name = name;
  if (phone) out.sender_phone = phone;
  return out;
}

/** Nome do participante individual (não o nome do grupo). */
export function pickZapsterParticipantName(msg) {
  const ctx = extractWhatsAppGroupContext(msg);
  if (!ctx) return '';
  return ctx.participantName;
}

/**
 * Resolve telefone e metadados da conversa para inbound (DM ou grupo).
 */
export function resolveInboundConversationFromMessage(msg) {
  const groupCtx = extractWhatsAppGroupContext(msg);
  if (groupCtx) {
    return {
      phone: groupCtx.groupId,
      contactName: groupCtx.groupName,
      profileImageUrl: groupCtx.groupPicture,
      isGroup: true,
      participantName: groupCtx.participantName,
      participantPhone: groupCtx.participantPhone,
    };
  }

  const senderRaw = msg?.sender?.id ?? msg?.from ?? msg?.sender ?? '';
  const phone = normalizeWhatsAppPhone(rawWhatsAppChatId(senderRaw) || senderRaw);
  const name =
    msg?.sender && typeof msg.sender === 'object'
      ? String(msg.sender.name || '').trim()
      : String(msg?.sender_name || '').trim();

  return {
    phone,
    contactName: name,
    profileImageUrl: '',
    isGroup: false,
    participantName: '',
    participantPhone: '',
  };
}
