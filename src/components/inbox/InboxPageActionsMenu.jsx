import React from 'react';
import { Bell, BellOff, MoreHorizontal, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
  DropdownMenuPanel,
} from '../shared/menu';

export default function InboxPageActionsMenu({
  open,
  onOpenChange,
  waSyncing,
  onSyncWhatsApp,
  desktopNotify,
  onToggleDesktopNotify,
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} className="inbox-page-actions-menu">
      <button
        type="button"
        className="inbox-list-panel__topbar-btn inbox-page-actions-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais ações do inbox"
        onClick={() => onOpenChange((v) => !v)}
      >
        <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <DropdownMenuPanel className="inbox-page-actions-menu__panel" aria-label="Ações do inbox">
          <DropdownMenuItem
            icon={<RefreshCw size={16} aria-hidden />}
            disabled={waSyncing}
            onClick={() => {
              onOpenChange(false);
              void onSyncWhatsApp();
            }}
          >
            {waSyncing ? 'Sincronizando WhatsApp…' : 'Sincronizar WhatsApp'}
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuItem
            icon={desktopNotify ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
            active={desktopNotify}
            onClick={() => {
              onOpenChange(false);
              void onToggleDesktopNotify();
            }}
          >
            {desktopNotify ? 'Notificações ativas' : 'Ativar notificações'}
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuLabel>Atalhos de teclado</DropdownMenuLabel>
          <DropdownMenuItemStatic>J / K — conversa anterior ou próxima</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>R — focar resposta</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>E — resolver conversa</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>Ctrl+R — recarregar mensagens</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>Ctrl+K — resolver / reabrir ticket</DropdownMenuItemStatic>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
