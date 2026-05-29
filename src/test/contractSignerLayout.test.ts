import { describe, expect, it } from 'vitest';
import {
  applyLayoutToSigners,
  countEnabledSignerSlots,
  defaultContractSignerLayout,
  parseContractSignerLayout,
  resolveSlotPositions,
} from '../../lib/contracts/contractSignerLayout.js';

describe('contractSignerLayout', () => {
  it('resolve z:last para pageCount', () => {
    const layout = defaultContractSignerLayout();
    const positions = resolveSlotPositions(layout.slots[0], 3);
    expect(positions.every((p) => p.z === 3)).toBe(true);
  });

  it('aplica positions aos signatários na ordem dos slots', () => {
    const layout = defaultContractSignerLayout();
    const signers = applyLayoutToSigners(
      [
        { name: 'Aluno', email: 'a@test.com', action: 'SIGN' },
        { name: 'Academia', email: 'b@test.com', action: 'SIGN' },
      ],
      layout,
      2
    );
    expect(signers[0]?.positions?.length).toBeGreaterThan(0);
    expect(signers[1]?.positions?.length).toBeGreaterThan(0);
    expect(signers[0]?.positions?.[0]?.x).toBe('25');
    expect(signers[1]?.positions?.[0]?.x).toBe('75');
  });

  it('conta slots ativos', () => {
    const layout = parseContractSignerLayout({
      version: 1,
      slots: [
        { label: 'A', enabled: true, elements: [{ element: 'SIGNATURE', x: '10', y: '90', z: 'last' }] },
        { label: 'B', enabled: false, elements: [{ element: 'SIGNATURE', x: '90', y: '90', z: 'last' }] },
      ],
    });
    expect(countEnabledSignerSlots(layout)).toBe(1);
  });
});
