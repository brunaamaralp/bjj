import React, { useState, useEffect, useMemo } from 'react';
import { Bell, MessageSquare, CheckSquare, Banknote, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNoteNotifications } from '../../hooks/useNoteNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import EmptyState from '../shared/EmptyState.jsx';
import { useLeadStore } from '../../store/useLeadStore';
import { useTaskStore } from '../../store/useTaskStore';
import { buildProactiveHubItems, proactiveHubTotalCount } from '../../lib/proactiveHub.js';
import { DropdownMenu, DropdownMenuPanel } from '../shared/menu';

const PROACTIVE_ICONS = {
  tasks_due: CheckSquare,
  payments_overdue: Banknote,
  followups: UserCheck,
};

export default function NotificationBell({ academyId, userId }) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, startPolling, stopPolling } = useNoteNotifications(academyId, userId);
  const leads = useLeadStore((s) => s.leads);
  const modules = useLeadStore((s) => s.modules);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const tasks = useTaskStore((s) => s.tasks);
  const proactiveItems = useMemo(
    () => buildProactiveHubItems({ tasks, leads, modules, financeConfig }),
    [tasks, leads, modules, financeConfig]
  );
  const proactiveCount = proactiveHubTotalCount(proactiveItems);
  const totalBadgeCount = unreadCount + proactiveCount;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (academyId && userId) {
      startPolling(academyId, userId);
    }
    return () => stopPolling();
  }, [academyId, userId, startPolling, stopPolling]);

  const handleItemClick = (n) => {
    markAsRead([n.id]);
    setIsOpen(false);
    const actionUrl = String(n.action_url || '').trim();
    if (actionUrl) {
      navigate(actionUrl);
      return;
    }
    if (n.is_system && n.type === 'whatsapp_disconnected') {
      navigate('/agente-ia');
      return;
    }
    navigate(`/inbox?phone=${normalizePhone(n.phone_number || '')}&conversation=${n.conversation_id}`);
  };

  function normalizePhone(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    return raw.replace(/[^\d]/g, '');
  }

  const badgeText = totalBadgeCount > 9 ? '9+' : totalBadgeCount;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} align="end" className="notification-bell-container">
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Notificações"
      >
        <Bell size={20} strokeWidth={2} />
        {totalBadgeCount > 0 ? <span className="notification-badge">{badgeText}</span> : null}
      </button>

      {isOpen ? (
        <DropdownMenuPanel className="notification-dropdown" aria-label="Notificações">
          <div className="notification-dropdown__header">
            <h3 className="notification-dropdown__title">Notificações</h3>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="notification-dropdown__clear"
                onClick={() => markAsRead(notifications.map((n) => n.id))}
              >
                Limpar tudo
              </button>
            ) : null}
          </div>

          <div className="notification-dropdown__list">
            {proactiveItems.map((item) => {
              const Icon = PROACTIVE_ICONS[item.id] || CheckSquare;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="notification-dropdown__row"
                  onClick={() => {
                    setIsOpen(false);
                    navigate(item.href);
                  }}
                >
                  <span className="notification-dropdown__row-icon">
                    <Icon size={16} />
                  </span>
                  <p className="notification-dropdown__row-text">{item.label}</p>
                </button>
              );
            })}
            {notifications.length === 0 && proactiveItems.length === 0 ? (
              <div style={{ padding: '16px 12px' }}>
                <EmptyState variant="compact" tone="dashed" icon={Bell} title="Nenhuma notificação nova" role="status" />
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="notification-dropdown__row"
                  onClick={() => handleItemClick(n)}
                >
                  <span className="notification-dropdown__row-icon notification-dropdown__row-icon--note">
                    <MessageSquare size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
                      {n.is_system ? (
                        <>
                          <strong>{n.title || n.lead_name || 'Aviso do sistema'}</strong>
                          {n.body ? (
                            <>
                              {' — '}
                              <span style={{ fontWeight: 500 }}>{n.body}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <strong>{n.created_by_name}</strong> adicionou uma nota em{' '}
                          <strong>{n.lead_name || 'um lead'}</strong>
                        </>
                      )}
                    </p>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
