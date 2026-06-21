import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('StudentProfile declaration order', () => {
  it('declares paymentStatus before deriving effectivePaymentStatus', () => {
    const filePath = path.resolve(__dirname, '../pages/StudentProfile.jsx');
    const source = fs.readFileSync(filePath, 'utf8');

    const paymentStatusIndex = source.indexOf('const [paymentStatus, setPaymentStatus] = useState(null);');
    const effectiveStatusIndex = source.indexOf(
      "const effectivePaymentStatus = studentPlanIsExempt ? { status: 'exempt', payment: null } : paymentStatus;"
    );

    expect(paymentStatusIndex).toBeGreaterThan(-1);
    expect(effectiveStatusIndex).toBeGreaterThan(-1);
    expect(paymentStatusIndex).toBeLessThan(effectiveStatusIndex);
  });
});
