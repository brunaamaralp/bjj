import React from 'react';
import { buildQuotedForwardBlock } from '../../lib/inboxQuotedForward.js';
import { InboxMenuAction } from './inboxMenuUi.jsx';

export default function InboxMessageMenuContent({
  payload,
  onClose,
  setDraft,
  textareaRef,
  copyToClipboard,
  toggleMsgFlag,
  setSelectedMsgKey,
  scrollToMsgKey,
  selectedPhoneFlags,
  cancelScheduledMessage,
}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const key = String(p.key || '').trim();
  const phone = String(p.phone || '').trim();
  const m = p.m && typeof p.m === 'object' ? p.m : {};
  const canCancel = Boolean(p.canCancel);
  const contentRaw = String(m?.content || '');
  const mid = String(m?.message_id || '').trim();

  return (
    <>
      <InboxMenuAction
        label="Responder"
        hint="Enter"
        onClick={() => {
          const base = contentRaw.replace(/\s+/g, ' ').trim();
          const snippet = base.length > 120 ? `${base.slice(0, 120)}…` : base;
          if (snippet) {
            setDraft((prev) => {
              const prefix = String(prev || '').trim() ? `${prev}\n\n` : '';
              return `${prefix}Respondendo: "${snippet}"\n\n`;
            });
          }
          onClose();
          try {
            textareaRef.current?.focus?.();
          } catch {
            void 0;
          }
        }}
      />
      <InboxMenuAction
        label="Copiar"
        hint="Ctrl+C"
        onClick={() => {
          copyToClipboard(contentRaw);
          onClose();
        }}
      />
      <InboxMenuAction
        label="Encaminhar"
        hint="Cita no rascunho"
        onClick={() => {
          const block = buildQuotedForwardBlock(contentRaw);
          setDraft((prev) => {
            const prefix = String(prev || '').trim() ? `${prev}\n\n` : '';
            return `${prefix}${block}`;
          });
          onClose();
          setTimeout(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            const end = ta.value.length;
            ta.setSelectionRange(end, end);
          }, 0);
        }}
      />
      <InboxMenuAction
        label="Fixar"
        hint={selectedPhoneFlags?.pinned?.[key] ? 'On' : 'Off'}
        onClick={() => {
          void toggleMsgFlag(phone, key, 'pinned');
          onClose();
        }}
      />
      <InboxMenuAction
        label="Importante"
        hint={selectedPhoneFlags?.important?.[key] ? 'On' : 'Off'}
        onClick={() => {
          void toggleMsgFlag(phone, key, 'important');
          onClose();
        }}
      />
      <InboxMenuAction
        label="Ver detalhes"
        hint="Seleciona"
        onClick={() => {
          setSelectedMsgKey(key);
          scrollToMsgKey(key);
          onClose();
        }}
      />
      <InboxMenuAction
        label="Excluir"
        hint={canCancel ? 'Cancela agendamento' : '—'}
        danger={canCancel}
        disabled={!canCancel || !mid}
        title={!canCancel || !mid ? 'Só é possível excluir mensagens agendadas' : undefined}
        onClick={() => {
          if (canCancel && mid) cancelScheduledMessage(mid);
          onClose();
        }}
      />
    </>
  );
}
