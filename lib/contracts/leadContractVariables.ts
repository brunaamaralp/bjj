import { formatContractDate, type ContractVariableMap } from './contractVariables.js';

function formatDateField(raw: unknown): string {
  const s = String(raw || '').trim().slice(0, 10);
  if (!s) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return formatContractDate(d);
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

  return vars;
}
