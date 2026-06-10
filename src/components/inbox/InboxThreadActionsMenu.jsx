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
  setLeadPanel,
  archiveConversation,
  unarchiveConversation,
  loadThread,
  markUnread,
  openPromptSettings,
  canConfigureAgenteIa,
  linkingLead,
  navigate,
  contactLabel,
  pendingTriage = false,
  activeContactLead = null,
  onConfirmTriage,
  onDismissTriage,
  onOpenLinkStudent,
  triageBusy = false,
  setEditingContactName,
  setContactNameDraft,
  onPinToWidget,
  showPinInMenu = false,
}) {
  const [open, setOpen] = useState(false);
  const phone = String(selectedPhone || '').trim();
  const hasLead = Boolean(String(selected?.lead_id || '').trim());
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
          {isResolved ? (
            <InboxMenuAction
              label="Reabrir conversa"
              hint="Ticket"
              disabled={!phone || ticketUpdating}
              onClick={() => {
                updateTicket({ status: 'open' });
                close();
              }}
            />
          ) : null}
          <InboxMenuAction
            label={isMobile || isNarrowDesktop ? 'Abrir detalhes' : contextPanelVisible ? 'Ocultar detalhes' : 'Mostrar detalhes'}
            hint="Detalhes"
            onClick={openDetails}
          />
          {showPinInMenu ? (
            <InboxMenuAction
              label="Continuar navegando"
              hint="Widget"
              disabled={!phone}
              onClick={() => {
                onPinToWidget?.();
                close();
              }}
            />
          ) : null}
          <InboxMenuAction
            label="Aguardando cliente"
            hint="Ticket"
            disabled={!phone || ticketUpdating}
            onClick={() => {
              updateTicket({ status: 'waiting_customer' });
              close();
            }}
          />
          <InboxMenuAction
            label="Transferir conversa"
            hint="Equipe"
            disabled={!phone || ticketUpdating}
            onClick={() => {
              setLeadPanel('transfer');
              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
              else setContextOpen(true);
              close();
            }}
          />
          {listFilter !== 'archived' && !isConvArchived ? (
            <InboxMenuAction
              label="Arquivar"
              hint="Inbox"
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
              hint="Inbox"
              disabled={!phone}
              onClick={() => {
                void unarchiveConversation(phone);
                close();
              }}
            />
          ) : null}
          <InboxMenuAction
            label="Recarregar conversa"
            hint="Atualiza"
            disabled={!phone}
            onClick={() => {
              loadThread(phone);
              close();
            }}
          />
          {threadUnread === 0 ? (
            <InboxMenuAction
              label="Marcar como não lida"
              hint="Lista"
              disabled={!phone}
              onClick={() => {
                void markUnread(phone);
                close();
              }}
            />
          ) : null}
          {canConfigureAgenteIa ? (
            <InboxMenuAction
              label="Configurar IA"
              hint="Prompt"
              onClick={() => {
                openPromptSettings();
                close();
              }}
            />
          ) : null}
          {pendingTriage ? (
            <>
              <InboxMenuAction
                label="Confirmar lead"
                hint="Triagem"
                disabled={triageBusy}
                onClick={() => {
                  void onConfirmTriage?.(activeContactLead);
                  close();
                }}
              />
              <InboxMenuAction
                label="Vincular aluno"
                hint="Triagem"
                disabled={triageBusy}
                onClick={() => {
                  onOpenLinkStudent?.();
                  if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                  else setContextOpen(true);
                  close();
                }}
              />
              <InboxMenuAction
                label="Não é lead"
                hint="Triagem"
                disabled={triageBusy}
                onClick={() => {
                  onDismissTriage?.(activeContactLead);
                  close();
                }}
              />
            </>
          ) : null}
          {!hasLead && !pendingTriage ? (
            <>
              <InboxMenuAction
                label={String(selected?.contact_name || '').trim() ? 'Editar nome' : 'Salvar nome'}
                hint="Contato"
                disabled={!phone}
                onClick={() => {
                  const seed =
                    String(selected?.contact_name || '').trim() ||
                    String(selected?.whatsapp_profile_name || '').trim();
                  setContactNameDraft?.(seed);
                  setEditingContactName?.(true);
                  close();
                }}
              />
              <InboxMenuAction
                label="Converter em contato"
                hint="CRM"
                disabled={!phone || linkingLead}
                onClick={() => {
                  setLeadPanel('convert');
                  if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                  else setContextOpen(true);
                  close();
                }}
              />
              <InboxMenuAction
                label="Associar contato"
                hint="CRM"
                disabled={!phone || linkingLead}
                onClick={() => {
                  setLeadPanel('associate');
                  if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                  else setContextOpen(true);
                  close();
                }}
              />
            </>
          ) : null}
          {hasLead ? (
            <>
              <InboxMenuAction
                label={`Ver ${contactLabel.toLowerCase()}`}
                hint="Perfil"
                onClick={() => {
                  navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`);
                  close();
                }}
              />
              <InboxMenuAction
                label="Kanban"
                hint="Funil"
                onClick={() => {
                  navigate('/pipeline');
                  close();
                }}
              />
            </>
          ) : null}
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
