import { describe, expect, it } from 'vitest';
import {
  buildEditorSnapshot,
  isEditorDirty,
} from '../components/contracts/contractTemplateEditorState.js';
import { resolveTemplateIdForPlan } from '../features/contracts/templatesApi.js';

describe('contractTemplateEditorState', () => {
  it('detects dirty when body changes', () => {
    const baseline = buildEditorSnapshot({
      name: 'A',
      description: '',
      purpose: 'enrollment',
      isDefault: false,
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
    });
    const current = buildEditorSnapshot({
      name: 'A',
      description: '',
      purpose: 'enrollment',
      isDefault: false,
      bodyHtml: '<p>y</p>',
      signerLayout: { slots: [] },
    });
    expect(isEditorDirty(current, baseline)).toBe(true);
  });

  it('is not dirty when snapshots match', () => {
    const snap = buildEditorSnapshot({
      name: 'A',
      description: 'd',
      purpose: 'rescission',
      isDefault: true,
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
    });
    expect(isEditorDirty(snap, snap)).toBe(false);
  });
});

describe('resolveTemplateIdForPlan', () => {
  const templates = [
    { $id: 'enroll-1', active: true, purpose: 'enrollment', isDefault: true, planNames: [] },
    { $id: 'rescind-1', active: true, purpose: 'rescission', isDefault: true, planNames: [] },
    { $id: 'enroll-plan', active: true, purpose: 'enrollment', isDefault: false, planNames: [] },
  ];

  it('uses finance plan contractTemplateId for enrollment', () => {
    const id = resolveTemplateIdForPlan(
      'Mensal Adulto',
      templates,
      [{ name: 'Mensal Adulto', contractTemplateId: 'enroll-plan' }],
      'enrollment'
    );
    expect(id).toBe('enroll-plan');
  });

  it('uses finance plan rescissionTemplateId for rescission', () => {
    const id = resolveTemplateIdForPlan(
      'Mensal Adulto',
      templates,
      [{ name: 'Mensal Adulto', rescissionTemplateId: 'rescind-1' }],
      'rescission'
    );
    expect(id).toBe('rescind-1');
  });

  it('falls back to default per purpose when plan has no link', () => {
    expect(resolveTemplateIdForPlan('Outro', templates, [], 'enrollment')).toBe('enroll-1');
    expect(resolveTemplateIdForPlan(null, templates, [], 'rescission')).toBe('rescind-1');
  });
});
