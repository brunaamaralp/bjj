import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  lastFetched: null,

  setNotifications: (notifications, unreadCount) => set({ 
    notifications, 
    unreadCount, 
    lastFetched: new Date() 
  }),

  fetchNotifications: async (academyId, userId, silent = false) => {
    if (!academyId || !userId) return;
    if (!silent) set({ loading: true });

    try {
      const jwt = await createSessionJwt();
      if (!jwt) return;

      const qs = new URLSearchParams({
        academy_id: academyId,
        user_id: userId
      });

      const res = await fetch(`/api/notifications?${qs.toString()}`, {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'x-academy-id': academyId
        }
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (data?.sucesso) {
        set({
          notifications: data.notifications || [],
          unreadCount: data.unreadCount || 0,
          loading: false
        });
      } else {
        if (!res.ok && !silent) {
          console.warn('[useNotificationStore] API notificações:', res.status, data?.erro || data?.codigo || '');
        }
        set({ loading: false });
      }
    } catch (err) {
      console.error('[useNotificationStore] Erro ao buscar:', err);
      set({ loading: false });
    }
  },

  markAsRead: async (academyId, userId, notificationIds) => {
    if (!academyId || !userId || !notificationIds?.length) return;

    // Atualização otimista
    const currentNotifications = get().notifications;
    const currentUnread = get().unreadCount;
    
    set({
      notifications: currentNotifications.filter(n => !notificationIds.includes(n.id)),
      unreadCount: Math.max(0, currentUnread - notificationIds.length)
    });

    try {
      const jwt = await createSessionJwt();
      await fetch(`/api/notifications/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId
        },
        body: JSON.stringify({
          notification_ids: notificationIds,
          user_id: userId
        })
      });
    } catch (err) {
      console.error('[useNotificationStore] Erro ao marcar como lida:', err);
    }
  },

  pollingInterval: null,
  startPolling: (academyId, userId) => {
    if (!academyId || !userId) return;
    if (get().pollingInterval) return;

    // Initial fetch
    get().fetchNotifications(academyId, userId);

    const interval = setInterval(() => {
      get().fetchNotifications(academyId, userId, true);
    }, 30000);

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const interval = get().pollingInterval;
    if (interval) {
      clearInterval(interval);
      set({ pollingInterval: null });
    }
  }
}));
