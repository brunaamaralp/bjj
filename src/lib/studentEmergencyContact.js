/** Contato de emergência derivado dos dados já cadastrados do aluno. */
export function registeredContactForEmergency(data) {
  const type = String(data?.type || 'Adulto').trim();
  const responsavel = String(data?.responsavel || '').trim();
  const name = String(data?.name || '').trim();
  const phoneDigits = String(data?.phone || '').replace(/\D/g, '');
  const isMinor = type === 'Criança' || type === 'Juniores';
  const contactName = isMinor && responsavel ? responsavel : name;
  return { contactName, phoneDigits };
}

export function emergencyMatchesRegistered(data) {
  const reg = registeredContactForEmergency(data);
  const ec = String(data?.emergencyContact || '').trim();
  const ep = String(data?.emergencyPhone || '').replace(/\D/g, '');
  if (!reg.contactName && !reg.phoneDigits) return false;
  return ec === reg.contactName && ep === reg.phoneDigits;
}

export function applyRegisteredEmergencyToForm(dataForm) {
  const { contactName, phoneDigits } = registeredContactForEmergency(dataForm);
  return {
    ...dataForm,
    emergencyContact: contactName,
    emergencyPhone: phoneDigits,
  };
}
