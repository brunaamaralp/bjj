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

  it('mostra valor esperado para aluno pendente sem pagamento registrado', () => {
    const student = {
      id: 'student-3',
      name: 'Carlos Lima',
      plan: 'Mensal',
      dueDay: 10,
    };
    const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{}}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'pending', dueDate: new Date('2026-06-10T12:00:00') })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy;
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => new Date(String(value))}
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
          financeConfig={financeConfig}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('R$ 200.00')).toBeInTheDocument();
  });

  it('mostra valor parcial como recebido de esperado', () => {
    const student = {
      id: 'student-4',
      name: 'Diana Parcial',
      plan: 'Mensal',
      dueDay: 10,
    };
    const payment = {
      status: 'partial',
      paid_amount: 80,
      expected_amount: 200,
      amount: 80,
    };
    const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{ [student.id]: payment }}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'partial', dueDate: new Date('2026-06-10T12:00:00') })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy;
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => new Date(String(value))}
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
          financeConfig={financeConfig}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('R$ 80.00 de R$ 200.00')).toBeInTheDocument();
  });

  it('mostra WhatsApp para aluno inadimplente com telefone', () => {
    const student = {
      id: 'student-5',
      name: 'Pedro Atraso',
      plan: 'Mensal',
      phone: '11987654321',
      dueDay: 5,
    };
    const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
    const studentOverdueMeta = {
      [student.id]: {
        daysOverdue: 5,
        stage: { day: 7, label: 'Primeiro contato', defaultMessage: 'Olá [nome]' },
        amount: 200,
      },
    };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{}}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'pending', dueDate: new Date('2026-06-01T12:00:00') })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy;
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => new Date(String(value))}
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
          financeConfig={financeConfig}
          studentOverdueMeta={studentOverdueMeta}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByRole('link', { name: /whatsapp — pedro atraso/i })).toHaveLength(2);
  });

  it('nao mostra WhatsApp para aluno pago', () => {
    const student = {
      id: 'student-6',
      name: 'Lucas Pago',
      plan: 'Mensal',
      phone: '11987654321',
      dueDay: 5,
    };
    const payment = { status: 'paid', amount: 200, paid_amount: 200 };

    render(
      <MemoryRouter>
        <MensalidadesListTable
          loading={false}
          displayedStudents={[student]}
          hasActiveFilters={false}
          onClearFilters={vi.fn()}
          terms={{ student: 'Aluno' }}
          paymentMap={{ [student.id]: payment }}
          currentMonth="2026-06"
          getRowStatus={() => ({ status: 'paid', dueDate: new Date('2026-06-05T12:00:00') })}
          startOfLocalDay={(date) => {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy;
          }}
          formatDdMm={(date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          parseYmdLocal={(value) => new Date(String(value))}
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
          financeConfig={{ plans: [{ name: 'Mensal', price: 200 }] }}
          studentOverdueMeta={{}}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /whatsapp/i })).not.toBeInTheDocument();
  });
});
