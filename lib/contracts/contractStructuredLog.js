export function logContractStructured(event, fields = {}) {
  const row = {
    event: String(event || 'contract_unknown'),
    ts: new Date().toISOString(),
    academy_id: fields.academy_id ?? fields.academyId ?? null,
    contract_id: fields.contract_id ?? fields.contractId ?? null,
    student_id: fields.student_id ?? fields.studentId ?? fields.lead_id ?? fields.leadId ?? null,
    status: fields.status ?? null,
    error: fields.error != null ? String(fields.error) : null,
    ...fields,
  };
  const line = JSON.stringify(row);
  if (row.error || String(event).includes('fail')) {
    console.error(line);
  } else {
    console.log(line);
  }
  return row;
}
