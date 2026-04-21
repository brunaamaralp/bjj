import { useCallback } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';

export function useNoteNotifications(academyId, userId) {
  const { 
    notifications, 
    unreadCount, 
    markAsRead: storeMarkAsRead, 
    fetchNotifications, 
    loading,
    startPolling,
    stopPolling
  } = useNotificationStore();

  const markAsRead = useCallback((notificationIds) => {
    storeMarkAsRead(academyId, userId, notificationIds);
  }, [academyId, userId, storeMarkAsRead]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    loading,
    startPolling,
    stopPolling,
    fetchNotifications
  };
}
