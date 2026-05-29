import { formatContractDate, type ContractVariableMap } from './contractVariables.js';

function formatDateField(raw: unknown): string {
  const s = String(raw || '').trim().slice(0, 10);
  if (!s) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return formatContractDate(d);
}

/** dd / mm / yyyy — formato comum em termos de rescisão. */
export function formatRescissionRequestDate(raw: unknown): string {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d} / ${m} / ${y}`;
}

function todayYmdLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Meses calendário entre ingresso e fim (inclusivo quando há pelo menos 1 dia no período). */
export function computeServiceMonths(enrollmentYmd: unknown, endYmd: unknown): number {
  const start = String(enrollmentYmd || '').trim().slice(0, 10);
  const end = String(endYmd || '').trim().slice(0, 10) || todayYmdLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  if (end < start) return 0;

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);

  let months = (ey - sy) * 12 + (em - sm);
  if (ed >= sd) months += 1;

  if (months <= 0 && end >= start) return 1;
  return Math.max(0, months);
}

export function formatServiceMonthsLabel(months: number): string {
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) return '0 meses';
  return n === 1 ? '1 mês' : `${n} meses`;
}

function formatCpfDisplay(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 11) return String(raw || '').trim();
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatPhoneDisplay(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return String(raw || '').trim();
}

export function emptyContractVariableMap(): ContractVariableMap {
  const today = formatContractDate();
  const todayYmd = todayYmdLocal();
  return {
    nome_aluno: '',
    email_aluno: '',
    telefone_aluno: '',
    cpf_aluno: '',
    data_nascimento: '',
    tipo_perfil: '',
    turma: '',
    faixa: '',
    sexo: '',
    plano: '',
    data_ingresso: '',
    origem: '',
    nome_responsavel: '',
    cpf_responsavel: '',
    contato_emergencia: '',
    telefone_emergencia: '',
    forma_pagamento_preferida: '',
    conta_pagamento_preferida: '',
    nome_academia: '',
    data_hoje: today,
    data_aceite: today,
    data_solicitacao_rescisao: formatRescissionRequestDate(todayYmd),
    meses_servico_utilizados: '0 meses',
  };
}

/** Preenche variáveis a partir de um documento lead/aluno (Appwrite ou objeto da UI). */
export function mapLeadDocToContractVariables(
  lead: Record<string, unknown> | null | undefined,
  academyName = ''
): ContractVariableMap {
  const vars = emptyContractVariableMap();
  vars.nome_academia = String(academyName || '').trim();
  if (!lead) return vars;

  vars.nome_aluno = String(lead.name || '').trim();
  vars.email_aluno = String(lead.email || '').trim();
  vars.telefone_aluno = formatPhoneDisplay(lead.phone || lead.telefone);
  vars.cpf_aluno = formatCpfDisplay(lead.cpf);
  vars.data_nascimento = formatDateField(lead.birth_date || lead.birthDate);
  vars.tipo_perfil = String(lead.type || '').trim();
  vars.turma = String(lead.turma || lead.class_name || lead.className || '').trim();
  vars.faixa = String(lead.belt || '').trim();
  vars.sexo = String(lead.sexo || '').trim();
  vars.plano = String(lead.plan || lead.plano || '').trim();
  vars.data_ingresso = formatDateField(lead.enrollmentDate || lead.enrollment_date);
  vars.origem = String(lead.origin || '').trim();
  vars.nome_responsavel = String(
    lead.responsavel || lead.parentName || lead.parent_name || ''
  ).trim();
  vars.cpf_responsavel = formatCpfDisplay(
    lead.cpf_responsavel || lead.cpfResponsavel || lead.responsavel_cpf || ''
  );
  vars.contato_emergencia = String(lead.emergencyContact || lead.emergency_contact || '').trim();
  vars.telefone_emergencia = formatPhoneDisplay(lead.emergencyPhone || lead.emergency_phone);
  vars.forma_pagamento_preferida = String(
    lead.preferred_payment_method || lead.preferredPaymentMethod || ''
  ).trim();
  vars.conta_pagamento_preferida = String(
    lead.preferred_payment_account || lead.preferredPaymentAccount || ''
  ).trim();

  const exitYmd = String(lead.exit_date || lead.exitDate || '').trim().slice(0, 10);
  const endYmd = exitYmd || todayYmdLocal();
  vars.data_solicitacao_rescisao =
    formatRescissionRequestDate(exitYmd) || formatRescissionRequestDate(endYmd);
  vars.meses_servico_utilizados = formatServiceMonthsLabel(
    computeServiceMonths(lead.enrollmentDate || lead.enrollment_date, endYmd)
  );

  return vars;
}
