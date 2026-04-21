import React, { useState, useEffect, useRef } from 'react';
import { Bell, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNoteNotifications } from '../../hooks/useNoteNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function NotificationBell({ academyId, userId }) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, startPolling, stopPolling } = useNoteNotifications(academyId, userId);
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
    navigate(`/inbox?phone=${normalizePhone(n.phone_number || '')}&conversation=${n.conversation_id}`);
    // O sistema de rotas do Inbox parece usar ?phone ou ?conversation. 
    // No Inbox.jsx, vi que useLocation.search busca 'phone'.
  };

  // Auxiliar para normalizar telefone (copiado do Inbox.jsx para garantir consistência)
  function normalizePhone(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    return raw.replace(/[^\d]/g, '');
  }

  const badgeText = unreadCount > 9 ? '9+' : unreadCount;

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          padding: 8,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.85)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s'
        }}
      >
        <Bell size={20} strokeWidth={2} />
        {unreadCount > 0 && (
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
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Bell size={24} style={{ opacity: 0.2, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: '13px' }}>Nenhuma notificação nova</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
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
                      <strong>{n.created_by_name}</strong> adicionou uma nota em <strong>{n.lead_name || 'um lead'}</strong>
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
