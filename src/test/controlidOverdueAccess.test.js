import { describe, it, expect } from 'vitest';
import {
  isControlIdOverdueBlockConfigured,
  shouldDenyOverdueAttendance,
} from '../../lib/server/controlidOverdueAccess.js';

describe('controlidOverdueAccess', () => {
  const settingsBlocked = {
    controlid: {
      enabled: true,
      block_overdue_access: true,
      ip: '10.0.0.1',
      password: 'x',
    },
  };

  it('isControlIdOverdueBlockConfigured exige enabled + flag', () => {
    expect(isControlIdOverdueBlockConfigured(null)).toBe(false);
    expect(isControlIdOverdueBlockConfigured({ controlid: { enabled: true } })).toBe(false);
    expect(isControlIdOverdueBlockConfigured(settingsBlocked)).toBe(true);
  });

  it('shouldDenyOverdueAttendance só nega com flag e overdue', () => {
    const config = { enabled: true, block_overdue_access: true };
    expect(shouldDenyOverdueAttendance(config, { overdue: false })).toBe(false);
    expect(shouldDenyOverdueAttendance(config, { overdue: true })).toBe(true);
    expect(shouldDenyOverdueAttendance({ enabled: true, block_overdue_access: false }, { overdue: true })).toBe(
      false
    );
  });
});
