/**
 * Monta payload Appwrite para coleção students a partir de doc lead (raw) ou objeto UI.
 *
 * `age` e `is_first_experience` não são atributos de students — ficam em leads;
 * na matrícula, `is_first_experience` é copiado para custom_answers_json.primeira_experiencia.
 */

/** Chave em custom_answers_json para histórico de qualificação do funil. */
export const STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY = 'primeira_experiencia';

function parseCustomAnswersObject(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/**
 * Preserva "primeira experiência" do funil em custom_answers (sem novo atributo Appwrite).
 * @param {object|string} existingCustomAnswers
 * @param {{ is_first_experience?: string, isFirstExperience?: string }} source
 */
export function mergeLeadQualificationIntoCustomAnswers(existingCustomAnswers, source = {}) {
  const answers = parseCustomAnswersObject(existingCustomAnswers);
  const firstExp = String(
    source.is_first_experience ?? source.isFirstExperience ?? ''
  ).trim();
  if (firstExp && answers[STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY] == null) {
    answers[STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY] = firstExp;
  }
  return JSON.stringify(answers).slice(0, 8192);
}

/**
 * @param {object} doc — documento Appwrite (leads ou UI com campos mistos)
 * @param {object} [overrides]
 */
export function buildStudentPayloadFromDoc(doc, overrides = {}) {
  const d = { ...doc, ...overrides };
  const turma = String(d.turma ?? d.class_name ?? d.className ?? '').trim().slice(0, 64);
  const dueRaw = Number(d.due_day ?? d.dueDay ?? 0);
  const dueDay =
    Number.isFinite(dueRaw) && dueRaw >= 1 && dueRaw <= 31 ? Math.trunc(dueRaw) : null;

  const payload = {
    name: String(d.name || '').trim(),
    phone: String(d.phone || '').trim(),
    email: String(d.email || '').trim().slice(0, 128),
    type: String(d.type || 'Adulto').trim() || 'Adulto',
    academyId: String(d.academyId || d.academy_id || '').trim(),
    source_origin: String(d.source_origin ?? d.origin ?? '').trim().slice(0, 128),
    student_status: String(d.student_status ?? d.studentStatus ?? 'active').trim() || 'active',
    plan: String(d.plan || '').trim(),
    enrollmentDate:
      String(d.enrollmentDate ?? d.enrollment_date ?? '').trim().slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    converted_at:
      String(d.converted_at ?? d.convertedAt ?? '').trim() || new Date().toISOString(),
    birth_date: String(d.birth_date ?? d.birthDate ?? '').slice(0, 10),
    sexo: String(d.sexo || '').trim().slice(0, 16),
    parentName: String(d.parentName ?? d.parent_name ?? '').trim(),
    emergencyContact: String(d.emergencyContact ?? d.emergency_contact ?? '').trim(),
    emergencyPhone: String(d.emergencyPhone ?? d.emergency_phone ?? '').trim(),
    cpf: String(d.cpf || '').trim(),
    responsavel: String(d.responsavel || '').trim(),
    cpf_responsavel: String(d.cpf_responsavel ?? d.cpfResponsavel ?? '').trim(),
    preferred_payment_method: String(
      d.preferred_payment_method ?? d.preferredPaymentMethod ?? ''
    ).trim(),
    preferred_payment_account: String(
      d.preferred_payment_account ?? d.preferredPaymentAccount ?? ''
    )
      .trim()
      .slice(0, 128),
    custom_answers_json: mergeLeadQualificationIntoCustomAnswers(
      d.custom_answers_json ?? d.customAnswers,
      d
    ),
    belt: String(d.belt || '').trim(),
    exit_reason: String(d.exit_reason ?? d.exitReason ?? '').trim(),
    exit_date: String(d.exit_date ?? d.exitDate ?? '').trim().slice(0, 10) || null,
  };

  if (turma) payload.turma = turma;
  if (dueDay != null) payload.due_day = dueDay;

  const deviceId = Number(d.device_id);
  if (Number.isFinite(deviceId) && deviceId > 0) payload.device_id = Math.trunc(deviceId);

  const controlIdUser = Number(d.controlid_user_id);
  if (Number.isFinite(controlIdUser) && controlIdUser > 0) {
    payload.controlid_user_id = Math.trunc(controlIdUser);
  }
  if (d.controlid_synced === true) payload.controlid_synced = true;
  const syncErr = String(d.controlid_sync_error || '').trim();
  if (syncErr) payload.controlid_sync_error = syncErr.slice(0, 256);

  const photoUrl = String(d.photo_url ?? d.photoUrl ?? '').trim();
  if (photoUrl) payload.photo_url = photoUrl.slice(0, 512);

  const planBilling = String(d.plan_billing ?? d.planBilling ?? '').trim();
  if (planBilling) payload.plan_billing = planBilling.slice(0, 16);

  if (d.freeze_start) payload.freeze_start = d.freeze_start;
  if (d.freeze_end) payload.freeze_end = d.freeze_end;
  if (d.freeze_status) payload.freeze_status = String(d.freeze_status).slice(0, 16);
  const freezeDays = Number(d.freeze_days_used ?? d.freezeDaysUsed);
  if (Number.isFinite(freezeDays) && freezeDays >= 0) payload.freeze_days_used = Math.trunc(freezeDays);
  const freezeYear = String(d.freeze_quota_year ?? d.freezeQuotaYear ?? '').trim();
  if (freezeYear) payload.freeze_quota_year = freezeYear.slice(0, 16);

  return payload;
}

/** Critério legado: doc ainda na coleção leads que deve ir para students. */
export function isLegacyStudentLeadDoc(doc) {
  if (!doc) return false;
  return (
    String(doc.status || '').trim() === 'Matriculado' ||
    String(doc.contact_type || '').trim() === 'student'
  );
}
