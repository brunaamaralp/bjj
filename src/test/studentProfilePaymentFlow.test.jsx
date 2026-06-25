import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentProfile from '../pages/StudentProfile.jsx';

const currentYm = () => new Date().toISOString().slice(0, 7);

const profileMocks = vi.hoisted(() => {
  const student = {
    id: 'student-1',
    name: 'Ana',
    plan: 'Mensal',
    plan_price: 200,
    preferredPaymentMethod: 'pix',
    preferredPaymentAccount: 'Conta principal',
    status: 'active',
    phone: '',
    email: '',
    type: 'Adulto',
  };

  return {
    student,
    paymentList: [],
    apiCreateStudentPayment: vi.fn(async (payload) => ({
      $id: 'pay-new',
      ...payload,
      status: payload.status || 'paid',
      reference_month: payload.reference_month || currentYm(),
    })),
    apiUpdateStudentPayment: vi.fn(async (_paymentId, payload) => ({
      $id: 'pay-existing',
      ...payload,
      status: payload.status || 'paid',
      reference_month: payload.reference_month || currentYm(),
    })),
    getStudentPayments: vi.fn(async () => profileMocks.paymentList),
    getPaymentStatus: vi.fn(async () => ({ status: 'none', payment: null })),
    deletePayment: vi.fn(),
    cancelBundleCoverageFromMonth: vi.fn(),
    fetchStudentById: vi.fn(async () => {}),
    mergeStudent: vi.fn(),
    refreshStudentPaymentStatus: vi.fn(),
    deleteStudent: vi.fn(),
    updateStudent: vi.fn(),
    validateMensalidadesPaymentForm: vi.fn(() => ({
      errors: {},
      amountNum: 200,
      paymentAccount: 'Conta principal',
    })),
    getSalesByStudent: vi.fn(async () => []),
    fetchReportsByStudent: vi.fn(async () => null),
    fetchStudentProfileBundle: vi.fn(async () => ({
      student,
      paymentStatus: null,
      planFreezes: [],
      attendanceStats: null,
      attendanceRisk: null,
    })),
    accountGet: vi.fn(async () => ({ name: 'Usuaria Teste' })),
    getAttendance: vi.fn(async () => []),
    getAttendanceStats: vi.fn(async () => ({ total: 0 })),
    getAcademyDocument: vi.fn(async () => ({})),
    listPlanFreezes: vi.fn(async () => []),
    startPlanFreeze: vi.fn(async () => {}),
    endPlanFreeze: vi.fn(async () => {}),
    toast: {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      addToast: vi.fn(),
    },
    navigate: vi.fn(),
    setSearchParams: vi.fn(),
  };
});

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'student-1' }),
  useNavigate: () => profileMocks.navigate,
  useSearchParams: () => [new URLSearchParams('tab=payments'), profileMocks.setSearchParams],
}));

vi.mock('../store/useStudentStore', () => {
  const state = {
    loading: false,
    fetchStudentById: (...args) => profileMocks.fetchStudentById(...args),
    mergeStudent: (...args) => profileMocks.mergeStudent(...args),
    refreshStudentPaymentStatus: (...args) => profileMocks.refreshStudentPaymentStatus(...args),
    deleteStudent: (...args) => profileMocks.deleteStudent(...args),
    updateStudent: (...args) => profileMocks.updateStudent(...args),
  };

  const useStudentStore = Object.assign(
    (selector) => selector(state),
    {
      getState: () => state,
    }
  );

  return {
    useStudentStore,
    selectStudentById: (_state, id) => (id === profileMocks.student.id ? profileMocks.student : null),
  };
});

vi.mock('../store/useLeadStore', () => ({
  LEAD_STATUS: {},
  useLeadStore: (selector) =>
    selector({
      academyId: 'academy-1',
      modules: { finance: true, sales: false },
      financeConfig: {
        plans: [{ name: 'Mensal', price: 200 }],
        bankAccounts: [{ id: 'acc-1', name: 'Conta principal' }],
      },
      userId: 'user-1',
      academyList: [{ id: 'academy-1', ownerId: 'owner-1', teamId: 'team-1', settings: null }],
      labels: {},
    }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => profileMocks.toast,
}));

vi.mock('../hooks/useAcademyTurmas.js', () => ({
  useAcademyTurmas: () => ({ turmas: [] }),
}));

vi.mock('../hooks/useZapsterWhatsAppConnection.js', () => ({
  useZapsterWhatsAppConnection: () => ({ waStatus: null, waStatusChecked: true }),
}));

vi.mock('../hooks/useNlPageContext.js', () => ({
  useNlPageContext: () => {},
}));

vi.mock('../lib/whatsappIntegrationState.js', () => ({
  isWhatsAppIntegrationConnected: () => false,
  isWhatsAppIntegrationDisconnected: () => false,
}));

vi.mock('../lib/canManageStudentPayments.js', () => ({
  useCanManageStudentPayments: () => true,
}));

vi.mock('../lib/canViewStudentFinance.js', () => ({
  useCanViewStudentFinance: () => true,
}));

vi.mock('../lib/useUserRole.js', () => ({
  useUserRole: () => 'admin',
}));

vi.mock('../lib/profilePermissions.js', () => ({
  useCanEditProfile: () => true,
}));

vi.mock('../lib/paymentMethods.js', () => ({
  PAYMENT_METHODS: ['pix', 'dinheiro', 'cartao'],
  storageDialectMethodLabelsMap: () => ({ pix: 'Pix' }),
}));

vi.mock('../lib/paymentMethodSettings.js', () => ({
  storageDialectPaymentMethodOptionsForFinance: () => [{ value: 'pix', label: 'Pix' }],
}));

vi.mock('../lib/terminology.js', () => ({
  useTerms: () => ({
    student: 'Aluno',
    plan: 'Plano',
    belt: 'Faixa',
    attendance: 'Check-in',
    trial: 'Aula experimental',
    pipelineEnrolledColumnLabel: 'Matriculado',
  }),
  contactLabelSingular: () => 'Contato',
  operationalStatusDisplayLabel: () => 'Ativo',
  pipelineStageDisplayLabel: () => 'Matriculado',
}));

vi.mock('../lib/errorMessages.js', () => ({
  friendlyError: (error) => String(error?.message || error || 'Erro'),
  studentPaymentFriendlyError: (error) => String(error?.message || error || 'Erro'),
}));

vi.mock('../lib/studentPayments.js', () => ({
  PAYMENT_CATEGORY: {
    PLAN: 'plan',
    BUNDLE: 'bundle',
    FEE: 'fee',
    OTHER: 'other',
  },
  getStudentPayments: profileMocks.getStudentPayments,
  getPaymentStatus: profileMocks.getPaymentStatus,
  deletePayment: profileMocks.deletePayment,
  cancelBundleCoverageFromMonth: profileMocks.cancelBundleCoverageFromMonth,
}));

vi.mock('../lib/studentPaymentsApi.js', () => ({
  apiCreateStudentPayment: profileMocks.apiCreateStudentPayment,
  apiUpdateStudentPayment: profileMocks.apiUpdateStudentPayment,
}));

vi.mock('../components/student/StudentPaymentModal.jsx', () => ({
  PAYMENT_MODAL_PRODUCT: 'product',
  buildDefaultPayForm: (student) => ({
    payment_type: 'plan',
    reference_month: currentYm(),
    bundle_start_month: currentYm(),
    bundle_months: 12,
    amount: '200,00',
    method: 'pix',
    account: 'Conta principal',
    status: 'paid',
    paid_at: `${currentYm()}-10`,
    due_date: '',
    plan_name: student?.plan || 'Mensal',
    note: '',
  }),
  paymentFormFromDoc: (payment, student) => ({
    payment_type: 'plan',
    reference_month: payment?.reference_month || currentYm(),
    bundle_start_month: payment?.reference_month || currentYm(),
    bundle_months: 12,
    amount: '200,00',
    method: payment?.method || 'pix',
    account: payment?.account || 'Conta principal',
    status: payment?.status || 'paid',
    paid_at: `${currentYm()}-10`,
    due_date: '',
    plan_name: payment?.plan_name || student?.plan || 'Mensal',
    note: payment?.note || '',
  }),
  default: ({ open, onSave }) =>
    open ? (
      <button type="button" onClick={() => void onSave()}>
        Salvar pagamento
      </button>
    ) : null,
}));

vi.mock('../components/student/StudentFinancialTimeline.jsx', () => ({
  default: ({ payments, onRegisterPayment, onEditPayment }) => (
    <div>
      <button type="button" onClick={() => onRegisterPayment('plan')}>
        Abrir registrar pagamento
      </button>
      <button
        type="button"
        onClick={() => onEditPayment(payments[0])}
        disabled={!payments?.[0]}
      >
        Abrir editar pagamento
      </button>
    </div>
  ),
}));

vi.mock('../components/student/StudentContractsSection.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/student/StudentContractHeaderChip.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/student/PlanFreezeModal.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/ConfirmDialog.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/profile/ProfileWhatsAppOfflineBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/profile/ProfileComunicacaoSection.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/profile/ProfileMobileQuickActions.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/profile/ProfileInlineField.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/FieldError.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/EmptyState.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/shared/StatusBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/DeactivateStudentModal.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/contracts/CreateContractModal.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/student/StudentStatusBadge.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/student/StudentOverdueBadge.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/attendance/AttendanceRiskBadge.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/chat-widget/NaviChatWidgetPanel.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/DateInput', () => ({
  DateInputField: () => null,
}));

vi.mock('../components/shared/PlanSelect.jsx', () => ({
  default: () => null,
}));

vi.mock('../lib/salesByStudent.js', () => ({
  getSalesByStudent: profileMocks.getSalesByStudent,
}));

vi.mock('../lib/reportsByStudentApi.js', () => ({
  fetchReportsByStudent: profileMocks.fetchReportsByStudent,
}));

vi.mock('../lib/attendance.js', () => ({
  getAttendance: profileMocks.getAttendance,
  getAttendanceStats: profileMocks.getAttendanceStats,
  createCheckin: vi.fn(),
  isAttendanceConfigured: () => true,
}));

vi.mock('../lib/leadEvents.js', () => ({
  addLeadEvent: vi.fn(),
  getLeadEvents: vi.fn(async () => ({ documents: [] })),
}));

vi.mock('../lib/deactivateStudent.js', () => ({
  deactivateStudent: vi.fn(),
  reactivateStudent: vi.fn(),
}));

vi.mock('../lib/studentsApi.js', () => ({
  fetchStudentProfileBundle: profileMocks.fetchStudentProfileBundle,
}));

vi.mock('../lib/attendanceRetentionApi.js', () => ({
  postAttendanceRetentionAction: vi.fn(async () => {}),
}));

vi.mock('../lib/getAcademyDocument.js', () => ({
  getAcademyDocument: profileMocks.getAcademyDocument,
}));

vi.mock('../lib/studentStatus.js', () => ({
  isActiveStudent: () => true,
  isInactiveStudent: () => false,
}));

vi.mock('../../lib/attendanceRetentionCore.js', () => ({
  isAtRiskTableStatus: () => false,
}));

vi.mock('../lib/studentDisplayStatus.js', () => ({
  resolveStudentListStatus: () => ({ label: 'Ativo' }),
}));

vi.mock('../lib/paymentStatus.js', () => ({
  normalizeProfilePaymentStatus: (status) => status,
}));

vi.mock('../lib/studentExitConfig.js', () => ({
  readStudentExitReasonsFromAcademyDoc: () => [],
}));

vi.mock('../lib/planFreeze.js', () => ({
  startPlanFreeze: profileMocks.startPlanFreeze,
  endPlanFreeze: profileMocks.endPlanFreeze,
  listPlanFreezes: profileMocks.listPlanFreezes,
  formatFreezeDateBr: () => '',
  canStartPlanFreeze: () => true,
  isFreezeActive: () => false,
  activeFreezeReasonFromHistory: () => '',
}));

vi.mock('../lib/appwrite', () => ({
  databases: {
    getDocument: vi.fn(async () => ({})),
  },
  DB_ID: 'db-test',
  ACADEMIES_COL: 'academies',
  account: {
    get: profileMocks.accountGet,
  },
}));

vi.mock('../lib/bankAccounts.js', () => ({
  validatePreferredPaymentAccount: () => '',
  hasConfiguredBankAccounts: () => true,
}));

vi.mock('../lib/studentPaymentTroco.js', () => ({
  trocoFieldsForPaymentPayload: () => ({}),
}));

vi.mock('../lib/mensalidadesPaymentForm.js', () => ({
  validateMensalidadesPaymentForm: (...args) => profileMocks.validateMensalidadesPaymentForm(...args),
  focusFirstStudentPaymentError: () => {},
}));

vi.mock('../lib/paymentReceiptDate.js', () => ({
  paidAtMonthDivergesFromCoverage: () => false,
  paidAtCoverageDivergenceConfirmDescription: () => '',
}));

vi.mock('../lib/planBilling.js', () => ({
  isStudentOnExemptPlan: () => false,
}));

describe('StudentProfile payment flow', () => {
  beforeEach(() => {
    profileMocks.paymentList = [];
    profileMocks.apiCreateStudentPayment.mockClear();
    profileMocks.apiUpdateStudentPayment.mockClear();
    profileMocks.getStudentPayments.mockClear();
    profileMocks.getPaymentStatus.mockClear();
    profileMocks.fetchStudentById.mockClear();
    profileMocks.mergeStudent.mockClear();
    profileMocks.fetchStudentProfileBundle.mockClear();
    profileMocks.getSalesByStudent.mockClear();
    profileMocks.fetchReportsByStudent.mockClear();
    profileMocks.accountGet.mockClear();
    profileMocks.getAttendance.mockClear();
    profileMocks.getAttendanceStats.mockClear();
    profileMocks.getAcademyDocument.mockClear();
    profileMocks.listPlanFreezes.mockClear();
    profileMocks.toast.show.mockClear();
    profileMocks.navigate.mockClear();
    profileMocks.setSearchParams.mockClear();
    profileMocks.validateMensalidadesPaymentForm.mockImplementation(() => ({
      errors: {},
      amountNum: 200,
      paymentAccount: 'Conta principal',
    }));
    window.matchMedia = window.matchMedia || (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('mantém o perfil acoplado apenas à interface de studentPaymentsApi', () => {
    const filePath = path.resolve(__dirname, '../pages/StudentProfile.jsx');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain("from '../lib/studentPaymentsApi.js'");
    expect(source).not.toMatch(/\bcreatePayment\b/);
    expect(source).not.toMatch(/\bupdatePayment\b/);
    expect(source).not.toContain("from '../lib/financeTxSettlementDisplay.js'");
  });

  it('usa studentPaymentsApi ao criar pagamento pelo perfil', async () => {
    render(<StudentProfile />);

    await waitFor(() => expect(profileMocks.getStudentPayments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir registrar pagamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar pagamento' }));

    await waitFor(() => expect(profileMocks.apiCreateStudentPayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(profileMocks.getStudentPayments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(profileMocks.fetchStudentById).toHaveBeenCalledWith('student-1'));
    expect(profileMocks.toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Pagamento registrado.' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Salvar pagamento' })).toBeNull()
    );
  });

  it('usa studentPaymentsApi ao atualizar pagamento pelo perfil', async () => {
    profileMocks.paymentList = [
      {
        $id: 'pay-existing',
        reference_month: currentYm(),
        amount: 200,
        method: 'pix',
        account: 'Conta principal',
        status: 'paid',
        plan_name: 'Mensal',
        note: '',
      },
    ];

    render(<StudentProfile />);

    await waitFor(() => expect(profileMocks.getStudentPayments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir editar pagamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar pagamento' }));

    await waitFor(() => expect(profileMocks.apiUpdateStudentPayment).toHaveBeenCalledTimes(1));
    expect(profileMocks.apiUpdateStudentPayment).toHaveBeenCalledWith(
      'pay-existing',
      expect.objectContaining({
        lead_id: 'student-1',
        academy_id: 'academy-1',
        plan_name: 'Mensal',
      }),
      expect.objectContaining({
        financeConfig: expect.any(Object),
        toast: profileMocks.toast,
      })
    );
    await waitFor(() => expect(profileMocks.getStudentPayments).toHaveBeenCalledTimes(2));
    expect(profileMocks.toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Pagamento atualizado.' })
    );
  });

  it('envia amount explícito igual a zero ao criar pagamento pelo perfil', async () => {
    profileMocks.validateMensalidadesPaymentForm.mockImplementation(() => ({
      errors: {},
      amountNum: 0,
      paymentAccount: 'Conta principal',
    }));

    render(<StudentProfile />);

    await waitFor(() => expect(profileMocks.getStudentPayments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir registrar pagamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar pagamento' }));

    await waitFor(() => expect(profileMocks.apiCreateStudentPayment).toHaveBeenCalledTimes(1));
    expect(profileMocks.apiCreateStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 0,
        paid_amount: 0,
      }),
      expect.any(Object)
    );
  });
});
