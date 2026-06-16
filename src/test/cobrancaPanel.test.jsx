import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CobrancaPanel from '../components/finance/CobrancaPanel.jsx';

vi.mock('../lib/collectionQueueApi.js', () => ({
  fetchCollectionQueue: vi.fn(),
}));

import { fetchCollectionQueue } from '../lib/collectionQueueApi.js';

const sampleData = {
  ok: true,
  currentMonth: '2026-06',
  collectionRules: [{ day: 1, label: '1ª tentativa' }],
  summary: { students: 1, totalOpen: 200, byStage: { '1': 1 } },
  rows: [
    {
      studentId: 's1',
      name: 'Maria Silva',
      phone: '11999999999',
      plan: 'Mensal',
      totalOpen: 200,
      oldestDaysOverdue: 10,
      stage: { day: 1, label: '1ª tentativa' },
      snoozed: false,
      openMonths: [
        {
          referenceMonth: '2026-05',
          amount: 200,
          daysOverdue: 10,
          dueDate: '2026-05-05',
          paymentId: 'p1',
        },
      ],
    },
  ],
};

describe('CobrancaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCollectionQueue.mockResolvedValue(sampleData);
  });

  it('renderiza KPIs e fila', async () => {
    render(
      <MemoryRouter>
        <CobrancaPanel academyId="ac-1" onSectionChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(await screen.findByText('Maria Silva')).toBeTruthy();
    expect(screen.getByText('Inadimplentes')).toBeTruthy();
    expect(screen.getByText(/D\+10/)).toBeTruthy();
  });

  it('expande meses em aberto', async () => {
    render(
      <MemoryRouter>
        <CobrancaPanel academyId="ac-1" onSectionChange={vi.fn()} />
      </MemoryRouter>
    );
    await screen.findByText('Maria Silva');
    const expandBtn = screen.getByRole('button', { name: /ver meses em aberto/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText('Registrar pagamento')).toBeTruthy();
  });
});
