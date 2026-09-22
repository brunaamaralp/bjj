import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import QuickNoteShortcut from '../components/quick-note/QuickNoteShortcut.jsx';
import { useLeadStore } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';

vi.mock('../lib/leadEvents.js', () => ({
  addLeadEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock('../lib/profileNoteApi.js', () => ({
  createProfileNoteApi: vi.fn().mockResolvedValue({ sucesso: true, event_id: 'ev-1' }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  }),
}));

import { createProfileNoteApi } from '../lib/profileNoteApi.js';

function mockDesktopViewport() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: !query.includes('1023px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function mockMobileViewport() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: query.includes('1023px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderShortcut(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QuickNoteShortcut academyId="acad-1" />
    </MemoryRouter>
  );
}

describe('QuickNoteShortcut', () => {
  beforeEach(() => {
    mockDesktopViewport();
    vi.mocked(createProfileNoteApi).mockClear();
    useLeadStore.setState({
      leads: [{ id: 'lead-1', name: 'Maria', phone: '11999999999' }],
      leadsReady: true,
      academyList: [{ id: 'acad-1', teamId: 't1', ownerId: 'o1' }],
      userId: 'user-1',
      fetchLeads: vi.fn(),
      updateLead: vi.fn().mockResolvedValue({}),
    });
    useStudentStore.setState({
      students: [{ id: 'stu-1', name: 'João', phone: '11888888888' }],
      studentsReady: true,
      fetchStudents: vi.fn(),
      updateStudent: vi.fn().mockResolvedValue({}),
    });
  });

  it('não renderiza em mobile', () => {
    mockMobileViewport();
    renderShortcut();
    expect(screen.queryByLabelText('Nota rápida')).not.toBeInTheDocument();
  });

  it('não renderiza em /inbox', () => {
    renderShortcut('/inbox');
    expect(screen.queryByLabelText('Nota rápida')).not.toBeInTheDocument();
  });

  it('mostra FAB em desktop e abre modal', async () => {
    const user = userEvent.setup();
    renderShortcut();
    expect(screen.getByLabelText('Nota rápida')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Nota rápida'));
    expect(screen.getByRole('dialog', { name: 'Nota rápida' })).toBeInTheDocument();
  });

  it('salva nota no lead selecionado e fecha', async () => {
    const user = userEvent.setup();
    renderShortcut();
    await user.click(screen.getByLabelText('Nota rápida'));

    const personInput = screen.getByLabelText('Selecionar aluno ou lead');
    await user.click(personInput);
    await user.click(screen.getByRole('option', { name: /Maria \(Lead\)/i }));

    await user.type(screen.getByLabelText('Nota'), 'Ligou pedindo horário');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(createProfileNoteApi).toHaveBeenCalledWith(
        expect.objectContaining({
          academyId: 'acad-1',
          personId: 'lead-1',
          text: 'Ligou pedindo horário',
          notifyTeam: false,
        })
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nota rápida' })).not.toBeInTheDocument();
    });
  });
});
