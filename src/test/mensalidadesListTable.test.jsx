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
          financeConfig={{}}
          getRowStatus={() => ({ status: 'paid', dueDate: new Date('2026-06-05T12:00:00'), paidAt: new Date('2026-06-10T12:00:00') })}
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

  it('mostra vencimento pelo dia do aluno quando nao ha pagamento registrado', () => {
    const student = {
      id: 'student-3',
      name: 'Maria Souza',
      plan: 'Mensal',
      dueDay: 12,
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
          financeConfig={{}}
          getRowStatus={() => ({ status: 'none', dueDate: new Date('2026-06-12T12:00:00'), paidAt: null })}
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
          METHOD_LABELS={{}}
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

    const row = screen.getByRole('row', { name: /maria souza/i });
    expect(within(row).getByText(/12\/06/)).toBeInTheDocument();
  });

  it('mostra conta/plataforma pela preferencia do aluno quando nao ha pagamento registrado', () => {
    const student = {
      id: 'student-4',
      name: 'Carlos Lima',
      plan: 'Mensal',
      preferredPaymentMethod: 'cartao_credito',
      preferredPaymentAccount: 'Stone Principal',
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
          financeConfig={{}}
          getRowStatus={() => ({ status: 'none', dueDate: null, paidAt: null })}
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
          METHOD_LABELS={{ cartao_credito: 'Cartão de crédito' }}
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

    const row = screen.getByRole('row', { name: /carlos lima/i });
    expect(within(row).getByText('Cartão de crédito')).toBeInTheDocument();
    expect(within(row).getByText('Stone Principal')).toBeInTheDocument();
  });

  it('mostra conta/plataforma do pagamento quando o aluno nao tem preferencia cadastrada', () => {
    const student = {
      id: 'student-5',
      name: 'Paula Dias',
      plan: 'Mensal',
    };
    const payment = {
      $id: 'payment-5',
      status: 'paid',
      amount: 200,
      method: 'pix',
      account: 'PagBank',
      paid_at: '2026-06-10T12:00:00.000Z',
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
          financeConfig={{}}
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

    const row = screen.getByRole('row', { name: /paula dias/i });
    expect(within(row).getByText('Pix')).toBeInTheDocument();
    expect(within(row).getByText('PagBank')).toBeInTheDocument();
  });

  it('mostra coluna Pagador com alias priorizado sobre responsavel', () => {
    const student = {
      id: 'student-6',
      name: 'Diego Alves',
      plan: 'Mensal',
      dueDay: 8,
      payerAliases: [{ display: 'Mae Diego PIX', normalized: 'MAE DIEGO PIX', source: 'manual' }],
      responsavel: 'Responsavel Ignorado',
      parentName: 'Pai Ignorado',
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
          financeConfig={{}}
          getRowStatus={() => ({ status: 'none', dueDate: new Date('2026-06-08T12:00:00'), paidAt: null })}
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
          METHOD_LABELS={{}}
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

    expect(screen.getByRole('columnheader', { name: 'Pagador' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pagador' })).toHaveAttribute(
      'title',
      expect.stringMatching(/alias|responsável|pai/i)
    );
    const row = screen.getByRole('row', { name: /diego alves/i });
    expect(within(row).getByText('Mae Diego PIX')).toBeInTheDocument();
    expect(within(row).queryByText('Responsavel Ignorado')).not.toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: /registrar pagamento de diego alves/i })
    ).toBeInTheDocument();
  });

  it('card mobile mostra valor pago e omite pagador vazio', () => {
    const student = {
      id: 'student-7',
      name: 'Elena Costa',
      plan: 'Mensal',
      dueDay: 3,
    };
    const payment = {
      $id: 'payment-7',
      status: 'paid',
      amount: 250,
      method: 'pix',
      paid_at: '2026-06-03T12:00:00.000Z',
    };

    const { container } = render(
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
          financeConfig={{}}
          getRowStatus={() => ({ status: 'paid', dueDate: new Date('2026-06-03T12:00:00'), paidAt: new Date('2026-06-03T12:00:00') })}
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

    const card = screen.getByRole('article', { name: /elena costa/i });
    expect(within(card).getByText('R$ 250.00')).toBeInTheDocument();
    expect(card.querySelector('.mensal-mobile-card__pagador')).toBeNull();
    expect(
      within(card).getByRole('button', { name: /estornar pagamento de elena costa/i })
    ).toBeInTheDocument();
    expect(container.querySelector('th[aria-sort="none"]')).toBeTruthy();
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
          financeConfig={{}}
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
