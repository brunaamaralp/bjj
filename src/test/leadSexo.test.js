import { describe, it, expect } from 'vitest';
import { normalizeSexo, sexoDisplayLabel, SEXO_VALUES } from '../lib/leadSexo.js';

describe('leadSexo', () => {
  it('normalizeSexo aceita valores válidos', () => {
    expect(normalizeSexo('masculino')).toBe(SEXO_VALUES.MASCULINO);
    expect(normalizeSexo('Feminino')).toBe(SEXO_VALUES.FEMININO);
    expect(normalizeSexo('nao_informado')).toBe(SEXO_VALUES.NAO_INFORMADO);
    expect(normalizeSexo('invalid')).toBe('');
  });

  it('sexoDisplayLabel retorna rótulo em português', () => {
    expect(sexoDisplayLabel(SEXO_VALUES.MASCULINO)).toBe('Masculino');
    expect(sexoDisplayLabel('')).toBe('');
  });
});
