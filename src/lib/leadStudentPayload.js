/**
 * Monta payload Appwrite para coleção students a partir de doc lead (raw) ou objeto UI.
 */

function parseCustomAnswersJson(raw) {
  if (!raw) return '{}';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw && typeof raw === 'object' ? raw : {});
  } catch {
    return '{}';
  }
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
    age: d.age != null && d.age !== '' ? String(d.age) : '',
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
    custom_answers_json: parseCustomAnswersJson(d.custom_answers_json ?? d.customAnswers),
    is_first_experience: String(d.is_first_experience ?? d.isFirstExperience ?? 'Sim'),
    belt: String(d.belt || '').trim(),
    // label_ids omitido se a coleção students atingir limite de atributos no Appwrite
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
