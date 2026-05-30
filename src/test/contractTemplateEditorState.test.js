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
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
      selectedPlanNames: [],
    });
    const current = buildEditorSnapshot({
      name: 'A',
      description: '',
      purpose: 'enrollment',
      bodyHtml: '<p>y</p>',
      signerLayout: { slots: [] },
      selectedPlanNames: [],
    });
    expect(isEditorDirty(current, baseline)).toBe(true);
  });

  it('detects dirty when linked plans change', () => {
    const baseline = buildEditorSnapshot({
      name: 'A',
      description: '',
      purpose: 'enrollment',
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
      selectedPlanNames: ['Mensal'],
    });
    const current = buildEditorSnapshot({
      name: 'A',
      description: '',
      purpose: 'enrollment',
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
      selectedPlanNames: ['Anual'],
    });
    expect(isEditorDirty(current, baseline)).toBe(true);
  });

  it('is not dirty when snapshots match', () => {
    const snap = buildEditorSnapshot({
      name: 'A',
      description: 'd',
      purpose: 'rescission',
      bodyHtml: '<p>x</p>',
      signerLayout: { slots: [] },
      selectedPlanNames: [],
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
