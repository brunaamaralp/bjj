import { describe, it, expect } from 'vitest';
import { maskPhone, maskCPF, maskCNPJ, maskCPFOrCNPJ, maskCurrency, parseCurrencyBRL } from '../lib/masks.js';

describe('Máscaras de formatação', () => {
  describe('maskPhone', () => {
    it('formata celular com 11 dígitos: (37) 99999-9999', () => {
      expect(maskPhone('37999999999')).toBe('(37) 99999-9999');
    });

    it('formata fixo com 10 dígitos: (37) 9999-9999', () => {
      expect(maskPhone('3799999999')).toBe('(37) 9999-9999');
    });

    it('remove caracteres não numéricos antes de formatar', () => {
      expect(maskPhone('(37) 99999-9999')).toBe('(37) 99999-9999');
    });

    it('limita a 11 dígitos', () => {
      expect(maskPhone('37999999999123')).toBe('(37) 99999-9999');
    });

    it('retorna string vazia para input vazio', () => {
      expect(maskPhone('')).toBe('');
    });
  });

  describe('maskCPF', () => {
    it('formata CPF: 000.000.000-00', () => {
      expect(maskCPF('00000000000')).toBe('000.000.000-00');
    });

    it('limita a 11 dígitos', () => {
      expect(maskCPF('12345678900123')).toBe('123.456.789-00');
    });

    it('remove não numéricos', () => {
      expect(maskCPF('123.456.789-00')).toBe('123.456.789-00');
    });
  });

  describe('maskCNPJ', () => {
    it('formata CNPJ: 00.000.000/0000-00', () => {
      expect(maskCNPJ('00000000000000')).toBe('00.000.000/0000-00');
    });

    it('limita a 14 dígitos', () => {
      expect(maskCNPJ('12345678901234567')).toBe('12.345.678/9012-34');
    });
  });

  describe('maskCPFOrCNPJ', () => {
    it('usa maskCPF para até 11 dígitos', () => {
      expect(maskCPFOrCNPJ('12345678900')).toBe('123.456.789-00');
    });

    it('usa maskCNPJ para 12+ dígitos', () => {
      expect(maskCPFOrCNPJ('12345678901234')).toBe('12.345.678/9012-34');
    });
  });

  describe('maskCurrency', () => {
    it('formata 15000 centavos como 150,00', () => {
      expect(maskCurrency('15000')).toBe('150,00');
    });

    it('formata 100 centavos como 1,00', () => {
      expect(maskCurrency('100')).toBe('1,00');
    });

    it('formata 0 como 0,00', () => {
      expect(maskCurrency('0')).toBe('0,00');
    });

    it('remove caracteres não numéricos antes de formatar', () => {
      expect(maskCurrency('R$ 1.500,00')).toBe('1.500,00');
    });
  });

  describe('parseCurrencyBRL', () => {
    it('converte "150,00" para 150', () => {
      expect(parseCurrencyBRL('150,00')).toBe(150);
    });

    it('converte "1.500,00" para 1500', () => {
      expect(parseCurrencyBRL('1.500,00')).toBe(1500);
    });

    it('converte "0,00" para 0', () => {
      expect(parseCurrencyBRL('0,00')).toBe(0);
    });

    it('retorna 0 para string vazia', () => {
      expect(parseCurrencyBRL('')).toBe(0);
    });
  });
});
