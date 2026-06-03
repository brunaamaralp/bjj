import { describe, it, expect } from 'vitest';
import {
  collectRegisteredPhonesFromStudentDoc,
  studentDocMatchesPhone,
} from '../../lib/registeredStudentPhones.js';

describe('registeredStudentPhones', () => {
  it('reconhece telefone do aluno e emergência normalizados', () => {
    const doc = { phone: '(11) 98888-7777', emergencyPhone: '5511933334444' };
    expect(collectRegisteredPhonesFromStudentDoc(doc)).toEqual(
      new Set(['11988887777', '11933334444'])
    );
    expect(studentDocMatchesPhone(doc, '5511988887777')).toBe(true);
    expect(studentDocMatchesPhone(doc, '11933334444')).toBe(true);
    expect(studentDocMatchesPhone(doc, '11999990000')).toBe(false);
  });
});
