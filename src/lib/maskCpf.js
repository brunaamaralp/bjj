/** Mascara CPF para exportação e logs (não reversível). */
export function maskCpfForExport(cpf) {
  const digits = String(cpf || '').replace(/\D/g, '');
  if (digits.length < 11) return '';
  return '***.***.***-**';
}
