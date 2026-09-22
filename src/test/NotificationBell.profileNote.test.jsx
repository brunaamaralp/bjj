import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../components/layout/NotificationBell.jsx';

const markAsRead = vi.fn();
const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('../hooks/useNoteNotifications', () => ({
  useNoteNotifications: () => ({
    notifications: [
      {
        id: 'n-profile',
        type: 'profile_note',
        is_profile_note: true,
        title: 'João Silva',
        lead_name: 'João Silva',
        lead_id: 'stu-1',
        body: 'Aluno pediu para alterar o vencimento para dia 10.',
        created_by_name: 'Bruna',
        created_at: new Date().toISOString(),
        action_url: '/student/stu-1?tab=timeline',
      },
    ],
    unreadCount: 1,
    markAsRead,
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../store/useLeadStore', () => ({
  useLeadStore: (sel) =>
    sel({
      leads: [],
      modules: {},
      financeConfig: {},
      leadsLastFetchedAt: Date.now(),
      loading: false,
      fetchLeads: vi.fn(),
    }),
}));

vi.mock('../store/useTaskStore', () => ({
  NOTIFICATION_TASKS_REFRESH_MS: 60_000,
  useTaskStore: (sel) =>
    sel({
      notificationTasks: [],
      fetchNotificationTasks: vi.fn(),
    }),
}));

vi.mock('../lib/proactiveHub.js', () => ({
  buildProactiveHubItems: () => [],
  proactiveHubTotalCount: () => 0,
}));

describe('NotificationBell profile_note', () => {
  beforeEach(() => {
    markAsRead.mockClear();
    navigate.mockClear();
  });

  it('mostra preview e navega marcando como lida', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell academyId="acad-1" userId="user-2" />
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText('Notificações'));
    expect(screen.getByText(/Nova nota · João Silva/i)).toBeInTheDocument();
    expect(screen.getByText(/vencimento para dia 10/i)).toBeInTheDocument();
    expect(screen.getByText(/Bruna/i)).toBeInTheDocument();

    await user.click(screen.getByText(/Nova nota · João Silva/i));
    expect(markAsRead).toHaveBeenCalledWith(['n-profile']);
    expect(navigate).toHaveBeenCalledWith('/student/stu-1?tab=timeline');
  });
});
