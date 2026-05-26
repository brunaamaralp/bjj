import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, MessageSquare, CheckSquare, Banknote, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNoteNotifications } from '../../hooks/useNoteNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import EmptyState from '../shared/EmptyState.jsx';
import { useLeadStore } from '../../store/useLeadStore';
import { useTaskStore } from '../../store/useTaskStore';
import { buildProactiveHubItems, proactiveHubTotalCount } from '../../lib/proactiveHub.js';

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
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (academyId && userId) {
      startPolling(academyId, userId);
    }
    return () => stopPolling();
  }, [academyId, userId, startPolling, stopPolling]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (n) => {
    markAsRead([n.id]);
    setIsOpen(false);
    const actionUrl = String(n.action_url || '').trim();
    if (actionUrl) {
      navigate(actionUrl);
      return;
    }
    if (n.is_system && n.type === 'whatsapp_disconnected') {
      navigate('/automacoes?tab=agente');
      return;
    }
    navigate(`/inbox?phone=${normalizePhone(n.phone_number || '')}&conversation=${n.conversation_id}`);
  };

  // Auxiliar para normalizar telefone (copiado do Inbox.jsx para garantir consistência)
  function normalizePhone(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    return raw.replace(/[^\d]/g, '');
  }

  const badgeText = totalBadgeCount > 9 ? '9+' : totalBadgeCount;

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          minWidth: 44,
          minHeight: 44,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.85)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s',
          boxSizing: 'border-box',
        }}
      >
        <Bell size={20} strokeWidth={2} />
        {totalBadgeCount > 0 && (
          <span
            className="notification-badge"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: '#EF4444',
              color: 'white',
              fontSize: '10px',
              fontWeight: 800,
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid var(--v900)'
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="notification-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            background: 'var(--surface)',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--border)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            className="notification-header"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAsRead(notifications.map(n => n.id))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Limpar tudo
              </button>
            )}
          </div>

          <div
            className="notification-list"
            style={{
              maxHeight: '400px',
              overflowY: 'auto'
            }}
          >
            {proactiveItems.map((item) => {
              const Icon = PROACTIVE_ICONS[item.id] || CheckSquare;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    navigate(item.href);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '12px',
                    transition: 'background 0.2s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '16px',
                      background: 'rgba(91, 63, 191, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: 1.4, fontWeight: 600 }}>
                      {item.label}
                    </p>
                  </div>
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
                  onClick={() => handleItemClick(n)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '12px',
                    transition: 'background 0.2s',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '16px',
                      background: 'var(--accent-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      flexShrink: 0
                    }}
                  >
                    <MessageSquare size={16} />
                  </div>
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
                          <strong>{n.created_by_name}</strong> adicionou uma nota em <strong>{n.lead_name || 'um lead'}</strong>
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
        </div>
      )}
    </div>
  );
}
