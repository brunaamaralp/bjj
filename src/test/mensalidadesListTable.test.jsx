import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MensalidadesListTable from '../components/finance/MensalidadesListTable.jsx';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  }),
}));

describe('MensalidadesListTable', () => {
  it('mantem a data de vencimento na coluna mesmo quando o pagamento ja foi registrado', () => {
    const student = {
      id: 'student-1',
      name: 'Joao Silva',
      plan: 'Mensal',
      dueDay: 5,
      preferredPaymentMethod: 'pix',
      preferredPaymentAccount: 'Conta principal',
    };
    const payment = {
      $id: 'payment-1',
      status: 'paid',
      amount: 200,
      method: 'pix',
      paid_at: '2026-06-10T12:00:00.000Z',
      due_date: '2026-06-05T12:00:00.000Z',
    };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasStudentsWithPlan
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{ [student.id]: payment }}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'paid', dueDate: null, paidAt: new Date('2026-06-10T12:00:00') })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy.getTime();
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => {
            const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (!match) return new Date(String(value));
            return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
          }}
          fmtMoney={(value) => `R$ ${Number(value).toFixed(2)}`}
          METHOD_LABELS={{ pix: 'Pix' }}
          dueSortOrder={null}
          setDueSortOrder={vi.fn()}
          openPaymentModal={vi.fn()}
          handleEstornar={vi.fn()}
          configuredTurmas={[]}
          canReverse
          linkStudentProfile={false}
          navRole="admin"
        />
      </MemoryRouter>
    );

    const row = screen.getByRole('row', { name: /joao silva/i });

    expect(within(row).getByText(/05\/06/)).toBeInTheDocument();
    expect(within(row).queryByText(/Pago em/i)).not.toBeInTheDocument();
  });

  it('renderiza aluno de plano isento com status Isento e sem acao de registrar', () => {
    const student = {
      id: 'student-2',
      name: 'Ana Bolsa',
      plan: 'Bolsista',
      dueDay: 5,
      preferredPaymentMethod: 'pix',
      preferredPaymentAccount: 'Conta principal',
    };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasStudentsWithPlan
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{}}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'exempt', dueDate: null, paidAt: null })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy.getTime();
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => {
            const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (!match) return new Date(String(value));
            return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
          }}
          fmtMoney={(value) => `R$ ${Number(value).toFixed(2)}`}
          METHOD_LABELS={{ pix: 'Pix' }}
          dueSortOrder={null}
          setDueSortOrder={vi.fn()}
          openPaymentModal={vi.fn()}
          handleEstornar={vi.fn()}
          configuredTurmas={[]}
          canReverse
          linkStudentProfile={false}
          navRole="admin"
        />
      </MemoryRouter>
    );

    const row = screen.getByRole('row', { name: /ana bolsa/i });

    expect(within(row).getAllByText('Isento')).toHaveLength(2);
    expect(within(row).queryByRole('button', { name: /registrar/i })).not.toBeInTheDocument();
  });
});
