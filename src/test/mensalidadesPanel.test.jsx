import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import MensalidadesPanel from '../components/finance/MensalidadesPanel.jsx';

const panelMocks = vi.hoisted(() => ({
  getMonthlyPayments: vi.fn(),
  accountGet: vi.fn(),
  loadMergedFinanceConfigForAcademy: vi.fn(),
  financeConfig: { plans: [{ name: 'Mensal', price: 200 }] },
  students: [
    {
      id: 'student-1',
      name: 'Joao Silva',
      plan: 'Mensal',
      dueDay: 5,
      preferredPaymentMethod: 'pix',
      preferredPaymentAccount: 'Conta principal',
      status: 'active',
    },
  ],
  toast: {
    show: vi.fn(),
    addToast: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../store/useLeadStore', () => ({
  LEAD_STATUS: {},
  useLeadStore: (selector) =>
    selector({
      academyId: 'academy-1',
      academyList: [{ id: 'academy-1', name: 'Academia Teste', teamId: 'team-1' }],
      teamId: 'team-1',
      userId: 'user-1',
      financeConfig: panelMocks.financeConfig,
      modules: { finance: true },
    }),
}));

vi.mock('../store/useStudentStore', () => {
  const useStudentStore = (selector) =>
    selector({
      students: panelMocks.students,
      updateStudent: vi.fn(),
    });
  useStudentStore.getState = () => ({
    students: panelMocks.students,
    updateStudent: vi.fn(),
  });
  return { useStudentStore };
});

vi.mock('../hooks/useToast', () => ({
  useToast: () => panelMocks.toast,
}));

vi.mock('../lib/appwrite', () => ({
  account: {
    get: panelMocks.accountGet,
  },
}));

vi.mock('../lib/financeTxApi.js', () => ({
  reverseFinanceTx: vi.fn(),
}));

vi.mock('../lib/studentPayments', () => ({
  PAYMENT_CATEGORY: {
    PLAN: 'plan',
    BUNDLE: 'bundle',
  },
  getMonthlyPayments: panelMocks.getMonthlyPayments,
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
}));

vi.mock('../lib/prefetchFinanceConfig.js', () => ({
  loadMergedFinanceConfigForAcademy: panelMocks.loadMergedFinanceConfigForAcademy,
}));

vi.mock('../lib/ensureAllStudentsLoaded.js', () => ({
  ensureAllStudentsLoaded: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/paymentStatus', () => ({
  resolveGridDisplayStatus: (student, _payment, _month, _today, financeConfig) => {
    const planName = String(student?.plan || '');
    const plan = (financeConfig?.plans || []).find((p) => p.name === planName);
    if (plan?.isExempt) return { key: 'exempt', row: {} };
    return { key: 'none', row: {} };
  },
  expectedAmountForStudent: () => 0,
}));

vi.mock('../components/finance/MonthlyPaymentGrid.jsx', () => ({
  default: () => <div data-testid="mensal-grid-view" />,
}));

vi.mock('../components/finance/PaymentExceptionsView.jsx', () => ({
  default: () => <div data-testid="mensal-exceptions-view" />,
}));

vi.mock('../components/finance/MensalidadesListTable.jsx', () => ({
  default: ({ displayedStudents = [], getRowStatus, currentMonth }) => {
    const first = displayedStudents[0] || null;
    const firstStatus = first ? getRowStatus(first, null, currentMonth)?.status || 'none' : 'none';
    return <div data-testid="mensal-list-view">{firstStatus}</div>;
  },
}));

vi.mock('../components/finance/MensalidadesStatusFilter.jsx', () => ({
  default: () => <div data-testid="mensal-status-filter" />,
}));

vi.mock('../components/shared/SearchField.jsx', () => ({
  default: ({ value, onChange, placeholder }) => (
    <input data-testid="mensal-search" value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

vi.mock('../components/finance/FinanceFiltersBar.jsx', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="finance-filters-bar">{children}</div>,
  FinanceToolbarSelect: ({ children, value, onChange, id }) => (
    <select data-testid={id || 'finance-toolbar-select'} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));

vi.mock('../components/shared/HubTabBar.jsx', () => ({
  default: () => <div data-testid="hub-tab-bar" />,
}));

vi.mock('../components/finance/FinanceBankAccountsSetupBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/StatusBanner.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('../components/shared/ErrorBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/ModalShell.jsx', () => ({
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}));

vi.mock('../components/shared/ConfirmDialog.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/layout/PageHeader.jsx', () => ({
  default: ({ actions }) => <div>{actions}</div>,
}));

vi.mock('../lib/useUserRole.js', () => ({
  useUserRole: () => 'admin',
}));

vi.mock('../hooks/useNlPageContext.js', () => ({
  useNlPageContext: () => {},
}));

vi.mock('../hooks/useAcademyTurmas.js', () => ({
  useAcademyTurmas: () => ({ turmas: [] }),
}));

vi.mock('../lib/terminology.js', () => ({
  useTerms: () => ({ student: 'Aluno' }),
}));

vi.mock('../lib/studentStatus.js', () => ({
  isActiveStudent: () => true,
}));

vi.mock('../lib/collectionRules.js', () => ({
  resolveCollectionStage: () => ({ day: null }),
  readCollectionSettingsFromFinanceConfig: () => ({ collectionRules: [] }),
}));

vi.mock('../lib/collectionOverdue.js', () => ({
  getPaymentRowStatus: () => ({ status: 'none', daysOverdue: 0 }),
  getReceptionDueBucket: () => null,
  openAmountForStudent: () => 0,
  resolveMensalidadeDueDate: () => null,
  studentDueDay: () => 1,
  dueDateInMonth: () => null,
}));

vi.mock('../lib/bankAccounts.js', () => ({
  hasConfiguredBankAccounts: () => true,
}));

vi.mock('../lib/paymentMethodBankDefaults.js', () => ({
  pickInitialBankAccountForPayment: () => 'Conta principal',
  accountWhenPaymentMethodChanges: () => 'Conta principal',
}));

vi.mock('../lib/captureMethodPaymentForm.js', () => ({
  resolveCaptureFieldsForPayment: () => ({}),
  whenCaptureMethodChanges: () => ({}),
  whenPaymentMethodChangesWithCapture: () => ({}),
}));

vi.mock('../components/finance/CaptureMethodSelect.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/finance/BankAccountSelect.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/finance/CashTrocoFields.jsx', () => ({
  default: () => null,
}));

vi.mock('../lib/mensalidadesExport.js', () => ({
  buildMensalidadesGridRows: () => [],
  filterSortMensalidadesRows: () => [],
  exportMensalidadesGridCsv: () => 0,
}));

vi.mock('../lib/paymentExceptions.js', () => ({
  isRealPaymentException: () => false,
  buildExceptionStatusFilterOptions: () => [],
  listExceptionRows: () => [],
  readExceptionStatusLabels: () => ({}),
  studentTurma: () => '',
}));

vi.mock('../lib/validations.js', () => ({
  formatPaymentDateLabel: () => '',
  isPaymentDateInFuture: () => false,
}));

vi.mock('../lib/paymentReceiptDate.js', () => ({
  suggestPaidAtYmd: () => '2026-06-01',
  paidAtMonthDivergesFromCoverage: () => false,
  paidAtCoverageDivergenceConfirmDescription: () => '',
}));

vi.mock('../components/finance/PaymentReceiptDateBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../lib/financeiroOverview.js', () => ({
  computeMensalidadesMonthKpis: () => ({
    expectedTotal: 0,
    receivedTotal: 0,
  }),
}));

describe('MensalidadesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panelMocks.financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
    panelMocks.students = [
      {
        id: 'student-1',
        name: 'Joao Silva',
        plan: 'Mensal',
        dueDay: 5,
        preferredPaymentMethod: 'pix',
        preferredPaymentAccount: 'Conta principal',
        status: 'active',
      },
    ];
    panelMocks.getMonthlyPayments.mockResolvedValue([]);
    panelMocks.accountGet.mockResolvedValue({ name: 'Usuario Teste' });
    panelMocks.loadMergedFinanceConfigForAcademy.mockResolvedValue({});
  });

  it('limpa o filtro de busca quando a rota volta sem o parametro search', async () => {
    const router = createMemoryRouter(
      [{ path: '/financeiro', element: <MensalidadesPanel embedded sectionMode /> }],
      {
        initialEntries: ['/financeiro?tab=a-receber&section=mensalidades&search=Joao%20Silva'],
      }
    );

    render(<RouterProvider router={router} />);

    const searchInput = await screen.findByTestId('mensal-search');
    expect(searchInput).toHaveValue('Joao Silva');

    await act(async () => {
      await router.navigate('/financeiro?tab=a-receber&section=mensalidades');
    });

    await waitFor(() => {
      expect(screen.getByTestId('mensal-search')).toHaveValue('');
    });
  });

  it('passa status exempt para a lista quando o plano do aluno e isento', async () => {
    panelMocks.financeConfig = {
      plans: [{ name: 'Bolsista', price: 0, isExempt: true }],
    };
    panelMocks.students = [
      {
        id: 'student-2',
        name: 'Ana Bolsa',
        plan: 'Bolsista',
        dueDay: 5,
        preferredPaymentMethod: 'pix',
        preferredPaymentAccount: 'Conta principal',
        status: 'active',
      },
    ];

    const router = createMemoryRouter(
      [{ path: '/financeiro', element: <MensalidadesPanel embedded sectionMode /> }],
      {
        initialEntries: ['/financeiro?tab=a-receber&section=mensalidades'],
      }
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId('mensal-list-view')).toHaveTextContent('exempt');
    });
  });
});
