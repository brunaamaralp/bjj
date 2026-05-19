export const SEXO_VALUES = {
  MASCULINO: 'masculino',
  FEMININO: 'feminino',
  NAO_INFORMADO: 'nao_informado',
};

export const SEXO_OPTIONS = [
  { value: SEXO_VALUES.MASCULINO, label: 'Masculino' },
  { value: SEXO_VALUES.FEMININO, label: 'Feminino' },
  { value: SEXO_VALUES.NAO_INFORMADO, label: 'Prefiro não informar' },
];

const VALID = new Set(Object.values(SEXO_VALUES));

/** @param {string|null|undefined} raw */
export function normalizeSexo(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (VALID.has(v)) return v;
  return '';
}

/** @param {string|null|undefined} value */
export function sexoDisplayLabel(value) {
  const v = normalizeSexo(value);
  const opt = SEXO_OPTIONS.find((o) => o.value === v);
  return opt?.label || '';
}
