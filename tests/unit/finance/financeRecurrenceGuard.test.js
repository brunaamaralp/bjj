import { describe, expect, it } from 'vitest';
import {
  assertNotRecurrenceTemplate,
  isRecurrenceTemplate,
  recurrenceTemplateSettleError,
  validateNotSettledRecurrenceTemplate,
} from '../../../lib/server/financeRecurrenceGuard.js';
import { FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE } from '../../../lib/constants.js';

describe('financeRecurrenceGuard', () => {
  it('isRecurrenceTemplate identifica template pelo booleano', () => {
    expect(isRecurrenceTemplate({ is_recurrence_template: true })).toBe(true);
    expect(isRecurrenceTemplate({ is_recurrence_template: false })).toBe(false);
    expect(isRecurrenceTemplate({ recurrence_origin_id: 'tpl-1' })).toBe(false);
  });

  it('recurrenceTemplateSettleError retorna código apenas para template', () => {
    expect(recurrenceTemplateSettleError({ is_recurrence_template: true })).toBe(
      FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE
    );
    expect(
      recurrenceTemplateSettleError({
        is_recurrence_template: false,
        recurrence_origin_id: 'tpl-salarios',
      })
    ).toBeNull();
  });

  it('assertNotRecurrenceTemplate lança para template', () => {
    expect(() => assertNotRecurrenceTemplate({ is_recurrence_template: true })).toThrow(
      FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE
    );
    expect(() =>
      assertNotRecurrenceTemplate({
        is_recurrence_template: false,
        recurrence_origin_id: 'tpl-1',
      })
    ).not.toThrow();
  });

  it('validateNotSettledRecurrenceTemplate bloqueia create liquidado', () => {
    expect(
      validateNotSettledRecurrenceTemplate({
        is_recurrence_template: true,
        receive_now: true,
      })
    ).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE);
    expect(
      validateNotSettledRecurrenceTemplate({
        is_recurrence_template: true,
        status: 'settled',
      })
    ).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE);
    expect(
      validateNotSettledRecurrenceTemplate({
        repeat_enabled: true,
        receive_now: true,
      })
    ).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE);
    expect(
      validateNotSettledRecurrenceTemplate({
        is_recurrence_template: true,
        receive_now: false,
        status: 'pending',
      })
    ).toBeNull();
  });
});
