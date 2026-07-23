import { maskCPF, maskPhone } from './masks.js';
import { turmaValueFromForm } from './academyTurmas.js';
import { normalizeBeltValue } from './beltGradesConfig.js';
import { validatePreferredPaymentAccount } from './bankAccounts.js';
import { findDuplicateStudentCpf } from './validations.js';
import {
  validateProfileCpf,
  validateProfileDueDay,
  validateProfileEmail,
  validateProfileName,
  validateProfilePhone,
} from './profileFieldValidation.js';
import { logProfileFieldUpdate } from './profileFieldAudit.js';
import { applyRegisteredEmergencyToForm } from './studentEmergencyContact.js';
import { snapshotPlanPriceFromCatalog } from './planBilling.js';

function displayForAudit(key, value, student) {
  if (key === 'phone' || key === 'emergencyPhone') {
    const d = String(value || '').replace(/\D/g, '');
    return d ? maskPhone(d) : '';
  }
  if (key === 'cpf' || key === 'cpfResponsavel') {
    const d = String(value || '').replace(/\D/g, '');
    return d ? maskCPF(d) : '';
  }
  if (key === 'turma') {
    return String(value || student?.turma || student?.className || '').trim();
  }
  return String(value ?? '').trim();
}

/**
 * Salva um único campo do cadastro do aluno.
 * @returns {Promise<object>} patch aplicado
 */
export async function saveStudentProfileField({
  fieldKey,
  draftValue,
  student,
  academyId,
  studentId,
  updateStudent,
  financeConfig,
  emergencySameAsRegistered,
  setDataForm,
  actorUserId,
  permissionContext,
  academySettingsRaw,
  graduationLabel = 'Graduação',
}) {
  const key = String(fieldKey || '').trim();
  if (!student || !studentId) throw new Error('Aluno não encontrado.');

  let patch = {};
  let auditFrom = '';
  let auditTo = '';
  let auditLabel = key;

  const prev = (k) => {
    if (k === 'turma') return String(student.turma || student.className || '').trim();
    return student[k];
  };

  switch (key) {
    case 'name': {
      const err = validateProfileName(draftValue);
      if (err) throw new Error(err);
      const name = String(draftValue).trim();
      patch = { name };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = name;
      auditLabel = 'Nome';
      break;
    }
    case 'phone': {
      const err = validateProfilePhone(draftValue);
      if (err) throw new Error(err);
      const phone = String(draftValue).replace(/\D/g, '');
      patch = { phone };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = displayForAudit(key, phone, student);
      auditLabel = 'Telefone';
      break;
    }
    case 'email': {
      const err = validateProfileEmail(draftValue);
      if (err) throw new Error(err);
      const email = String(draftValue || '').trim();
      patch = { email };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = email;
      auditLabel = 'E-mail';
      break;
    }
    case 'cpf': {
      const err = validateProfileCpf(draftValue);
      if (err) throw new Error(err);
      const cpf = String(draftValue || '').replace(/\D/g, '');
      if (cpf) {
        const dup = await findDuplicateStudentCpf(academyId, cpf, studentId);
        if (dup) throw new Error('CPF já cadastrado para outro aluno');
      }
      patch = { cpf };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = displayForAudit(key, cpf, student);
      auditLabel = 'CPF';
      break;
    }
    case 'cpfResponsavel': {
      const err = validateProfileCpf(draftValue);
      if (err) throw new Error(err);
      const cpfResponsavel = String(draftValue || '').replace(/\D/g, '');
      patch = { cpfResponsavel };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = displayForAudit(key, cpfResponsavel, student);
      auditLabel = 'CPF do responsável';
      break;
    }
    case 'responsavel':
    case 'emergencyContact': {
      const val = String(draftValue || '').trim();
      patch = { [key]: val };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = val;
      auditLabel = key === 'responsavel' ? 'Responsável' : 'Contato de emergência';
      break;
    }
    case 'emergencyPhone': {
      const err = validateProfilePhone(draftValue);
      if (err) throw new Error(err);
      const emergencyPhone = String(draftValue || '').replace(/\D/g, '');
      patch = { emergencyPhone };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = displayForAudit(key, emergencyPhone, student);
      auditLabel = 'Telefone de emergência';
      break;
    }
    case 'birthDate':
    case 'enrollmentDate': {
      const val = String(draftValue || '').slice(0, 10);
      patch = { [key]: val };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = val;
      auditLabel = key === 'birthDate' ? 'Nascimento' : 'Ingresso';
      break;
    }
    case 'sexo': {
      const sexo = String(draftValue || '').trim();
      patch = { sexo };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = sexo;
      auditLabel = 'Sexo';
      break;
    }
    case 'plan': {
      const plan = String(draftValue || '').trim();
      const planPrice = snapshotPlanPriceFromCatalog(financeConfig, plan);
      patch = { plan };
      if (planPrice != null) patch.planPrice = planPrice;
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = planPrice != null ? `${plan} (${planPrice})` : plan;
      auditLabel = 'Plano';
      break;
    }
    case 'turma': {
      const { turmaSelect, turmaOther } = draftValue || {};
      const turma = turmaValueFromForm(turmaSelect, turmaOther);
      patch = { turma };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = turma;
      auditLabel = 'Turma';
      break;
    }
    case 'belt': {
      const invalidMessage = `Selecione uma ${String(graduationLabel || 'graduação').toLowerCase()} válida.`;
      const belt = normalizeBeltValue(draftValue, academySettingsRaw, student.belt, { invalidMessage });
      patch = { belt };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = belt;
      auditLabel = graduationLabel;
      break;
    }
    case 'dueDay': {
      const err = validateProfileDueDay(draftValue);
      if (err) throw new Error(err);
      const raw = String(draftValue ?? '').trim();
      const dueNum = raw === '' ? null : Number(raw.replace(/[^\d]/g, ''));
      const dueDay =
        dueNum != null && Number.isFinite(dueNum) && dueNum >= 1 && dueNum <= 31
          ? Math.trunc(dueNum)
          : null;
      patch = { dueDay };
      auditFrom = prev('dueDay') != null ? `Dia ${prev('dueDay')}` : '';
      auditTo = dueDay != null ? `Dia ${dueDay}` : '';
      auditLabel = 'Dia de vencimento';
      break;
    }
    case 'preferredPaymentMethod': {
      patch = { preferredPaymentMethod: String(draftValue || '').trim() };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = String(draftValue || '').trim();
      auditLabel = 'Forma de pagamento habitual';
      break;
    }
    case 'preferredPaymentAccount': {
      const accountCheck = validatePreferredPaymentAccount(draftValue, financeConfig);
      if (!accountCheck.ok) throw new Error(accountCheck.message);
      patch = { preferredPaymentAccount: String(draftValue || '').trim() };
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = String(draftValue || '').trim();
      auditLabel = 'Conta habitual';
      break;
    }
    default:
      throw new Error('Campo não editável inline.');
  }

  await updateStudent(studentId, patch);

  if (key === 'phone' && emergencySameAsRegistered && typeof setDataForm === 'function') {
    setDataForm((p) => {
      const next = applyRegisteredEmergencyToForm({
        ...p,
        phone: patch.phone,
        name: p.name || student.name,
      });
      return { ...next, emergencyPhone: maskPhone(next.emergencyPhone || '') };
    });
  }

  void logProfileFieldUpdate({
    academyId,
    leadId: studentId,
    field: key,
    fieldLabel: auditLabel,
    from: auditFrom,
    to: auditTo,
    actorUserId,
    permissionContext,
  }).catch(() => {});

  return patch;
}
