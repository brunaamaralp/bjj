import React, { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuPanel } from '../shared/menu';
import { InboxMenuAction } from './inboxMenuUi.jsx';

export default function InboxThreadActionsMenu({
  selectedPhone,
  selected,
  items,
  listFilter,
  isMobile,
  isNarrowDesktop,
  contextPanelVisible,
  setDetailsOpen,
  setContextOpen,
  updateTicket,
  ticketUpdating,
  archiveConversation,
  unarchiveConversation,
  markUnread,
}) {
  const [open, setOpen] = useState(false);
  const phone = String(selectedPhone || '').trim();
  const listArr = Array.isArray(items) ? items : [];
  const listRow = listArr.find((row) => String(row?.phone_number || '').trim() === phone);
  const isConvArchived = Boolean(listRow?.archived || selected?.archived);
  const threadUnread = Number.isFinite(Number(listRow?.unread_count)) ? Number(listRow.unread_count) : 0;
  const isResolved = String(selected?.ticket_status || '').trim().toLowerCase() === 'resolved';

  const close = () => setOpen(false);
  const openDetails = () => {
    if (isMobile || isNarrowDesktop) setDetailsOpen(true);
    else setContextOpen((v) => !v);
    close();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} className="inbox-thread-actions-menu">
      <button
        className="inbox-thread-header__icon-btn"
        type="button"
        disabled={!selectedPhone}
        title={!selectedPhone ? 'Selecione uma conversa para ver as ações' : 'Mais ações'}
        aria-label="Mais ações da conversa"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={20} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <DropdownMenuPanel className="inbox-thread-actions-menu__panel" aria-label="Ações da conversa">
          <InboxMenuAction
            label={isMobile || isNarrowDesktop ? 'Detalhes da conversa' : contextPanelVisible ? 'Ocultar detalhes' : 'Detalhes da conversa'}
            onClick={openDetails}
          />
          {threadUnread === 0 ? (
            <InboxMenuAction
              label="Marcar como não lida"
              disabled={!phone}
              onClick={() => {
                void markUnread(phone);
                close();
              }}
            />
          ) : null}
          {listFilter !== 'archived' && !isConvArchived ? (
            <InboxMenuAction
              label="Arquivar"
              disabled={!phone}
              onClick={() => {
                void archiveConversation(phone);
                close();
              }}
            />
          ) : null}
          {listFilter === 'archived' || isConvArchived ? (
            <InboxMenuAction
              label="Desarquivar"
              disabled={!phone}
              onClick={() => {
                void unarchiveConversation(phone);
                close();
              }}
            />
          ) : null}
          {isResolved ? (
            <InboxMenuAction
              label="Reabrir conversa"
              disabled={!phone || ticketUpdating}
              onClick={() => {
                updateTicket({ status: 'open' });
                close();
              }}
            />
          ) : null}
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
