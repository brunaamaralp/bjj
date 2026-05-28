import { describe, expect, it } from 'vitest';
import {
  buildEditorSnapshot,
  isEditorDirty,
} from '../components/contracts/contractTemplateEditorState.js';

describe('contractTemplateEditorState', () => {
  it('detects dirty when body changes', () => {
    const baseline = buildEditorSnapshot({
      name: 'A',
      description: '',
      planNames: ['Mensal'],
      isDefault: false,
      bodyHtml: '<p>x</p>',
    });
    const current = buildEditorSnapshot({
      name: 'A',
      description: '',
      planNames: ['Mensal'],
      isDefault: false,
      bodyHtml: '<p>y</p>',
    });
    expect(isEditorDirty(current, baseline)).toBe(true);
  });

  it('is not dirty when snapshots match', () => {
    const snap = buildEditorSnapshot({
      name: 'A',
      description: 'd',
      planNames: ['Anual', 'Mensal'],
      isDefault: true,
      bodyHtml: '<p>x</p>',
    });
    expect(isEditorDirty(snap, snap)).toBe(false);
  });
});
