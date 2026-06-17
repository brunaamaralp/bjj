import { maskPhone } from './masks.js';
import { turmaValueFromForm } from './academyTurmas.js';
import {
  validateProfileName,
  validateProfilePhone,
} from './profileFieldValidation.js';
import { logProfileFieldUpdate } from './profileFieldAudit.js';
import { sexoDisplayLabel } from './leadSexo.js';

function displayLeadFieldForAudit(key, value, lead) {
  if (key === 'phone') {
    const d = String(value || '').replace(/\D/g, '');
    return d ? maskPhone(d) : '';
  }
  if (key === 'sexo') return sexoDisplayLabel(value) || String(value || '').trim();
  if (key === 'turma') return String(value || lead?.turma || lead?.className || '').trim();
  return String(value ?? '').trim();
}

const LEAD_FIELD_LABELS = {
  name: 'Nome',
  phone: 'Telefone',
  parentName: 'Responsável',
  age: 'Idade',
  birthDate: 'Nascimento',
  sexo: 'Sexo',
  turma: 'Turma',
  plan: 'Plano',
  enrollmentDate: 'Data de matrícula',
  origin: 'Origem',
  isFirstExperience: 'Primeira experiência',
};

/**
 * @returns {Promise<object>} patch aplicado
 */
export async function saveLeadProfileField({
  fieldKey,
  draftValue,
  lead,
  leadId,
  updateLead,
  academyId,
  actorUserId,
  permissionContext,
}) {
  const key = String(fieldKey || '').trim();
  if (!lead || !leadId) throw new Error('Registro não encontrado.');

  let patch = {};
  let auditFrom = '';
  let auditTo = '';

  const prev = (k) => {
    if (k === 'turma') return String(lead.turma || lead.className || '').trim();
    return lead[k];
  };

  switch (key) {
    case 'name': {
      const err = validateProfileName(draftValue);
      if (err) throw new Error(err);
      patch = { name: String(draftValue).trim() };
      break;
    }
    case 'phone': {
      const err = validateProfilePhone(draftValue, { required: true });
      if (err) throw new Error(err);
      patch = { phone: String(draftValue).replace(/\D/g, '') };
      break;
    }
    case 'parentName':
    case 'age':
    case 'birthDate':
    case 'plan':
    case 'enrollmentDate':
    case 'origin':
    case 'isFirstExperience':
    case 'sexo': {
      patch = { [key]: String(draftValue ?? '').trim() };
      break;
    }
    case 'turma': {
      const { turmaSelect, turmaOther } = draftValue || {};
      patch = { turma: turmaValueFromForm(turmaSelect, turmaOther) };
      break;
    }
    default:
      throw new Error('Campo não editável inline.');
  }

  auditFrom = displayLeadFieldForAudit(key, prev(key), lead);
  auditTo = displayLeadFieldForAudit(
    key,
    key === 'turma' ? patch.turma : patch[key],
    lead
  );

  await updateLead(leadId, patch, { fallbackLead: lead });

  void logProfileFieldUpdate({
    academyId: academyId || lead.academyId,
    leadId,
    field: key,
    fieldLabel: LEAD_FIELD_LABELS[key] || key,
    from: auditFrom,
    to: auditTo,
    actorUserId,
    permissionContext,
  }).catch(() => {});

  return patch;
}
