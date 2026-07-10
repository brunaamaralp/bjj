import { describe, it, expect } from 'vitest';
import {
  addDaysToYmd,
  parseTemplateItems,
  serializeTemplateItems,
  serializeTemplateItemsForStore,
  mapTemplateDoc,
  progressLabelForLead,
  buildTemplateTaskDescription,
  parseTemplateTaskMeta,
  resolveTaskTemplateName,
  taskDescriptionForDisplay,
} from '../lib/taskTemplates.js';

describe('taskTemplates', () => {
  it('adds days to ymd', () => {
    expect(addDaysToYmd('2026-05-10', 1)).toBe('2026-05-11');
    expect(addDaysToYmd('2026-05-10', 30)).toBe('2026-06-09');
  });

  it('parses template items', () => {
    const items = parseTemplateItems('[{"title":"A","offset_days":0,"order":0}]');
    expect(items[0].title).toBe('A');
  });

  it('parses Appwrite string[] items_json (single JSON blob)', () => {
    const store = serializeTemplateItemsForStore([{ title: 'A', offset_days: 0, order: 0 }]);
    expect(store).toHaveLength(1);
    const items = parseTemplateItems(store);
    expect(items[0].title).toBe('A');
  });

  it('parses Appwrite string[] with one JSON string per item', () => {
    const store = [
      JSON.stringify({ title: 'A', offset_days: 0, order: 0 }),
      JSON.stringify({ title: 'B', offset_days: 1, order: 1 }),
    ];
    const items = parseTemplateItems(store);
    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('round-trips assigned_to in template items', () => {
    const raw = [{ title: 'Ligar', offset_days: 1, assigned_to: 'user-abc', order: 0 }];
    const json = serializeTemplateItems(raw);
    const items = parseTemplateItems(json);
    expect(items[0].assigned_to).toBe('user-abc');
  });

  it('reads default_assignee alias as assigned_to', () => {
    const items = parseTemplateItems('[{"title":"X","default_assignee":"uid-1","order":0}]');
    expect(items[0].assigned_to).toBe('uid-1');
  });

  it('mapTemplateDoc treats missing enabled as true', () => {
    expect(mapTemplateDoc({ $id: '1', name: 'T', trigger: 'manual' }).enabled).toBe(true);
    expect(mapTemplateDoc({ $id: '1', name: 'T', trigger: 'manual', enabled: false }).enabled).toBe(false);
  });

  it('computes progress label', () => {
    const batch = 'batch-1';
    const desc = buildTemplateTaskDescription({
      templateId: 't1',
      batchId: batch,
      templateName: 'Test',
      itemOrder: 0,
      notes: '',
    });
    const tasks = [
      { lead_id: 'L1', status: 'done', description: desc },
      { lead_id: 'L1', status: 'pending', description: desc },
    ];
    expect(progressLabelForLead('L1', tasks)).toBe('1 de 2 concluídas');
  });

  it('round-trips task meta in description', () => {
    const d = buildTemplateTaskDescription({
      templateId: 'x',
      batchId: 'b',
      templateName: 'Nome',
      itemOrder: 2,
      notes: 'instr',
    });
    const m = parseTemplateTaskMeta(d);
    expect(m.templateId).toBe('x');
    expect(m.notes).toBe('instr');
  });

  it('resolveTaskTemplateName reads from description when doc fields are empty', () => {
    const desc = buildTemplateTaskDescription({
      templateId: 'tpl-99',
      batchId: 'batch-1',
      templateName: 'Onboarding',
      itemOrder: 0,
      notes: '',
    });
    const task = { description: desc, template_id: '', template_name: '' };
    expect(resolveTaskTemplateName(task)).toBe('Onboarding');
  });

  it('resolveTaskTemplateName falls back to template map by id', () => {
    const map = new Map([['tpl-99', 'Matrícula']]);
    const task = {
      description: buildTemplateTaskDescription({
        templateId: 'tpl-99',
        batchId: 'batch-1',
        templateName: '',
        itemOrder: 0,
        notes: '',
      }),
    };
    expect(resolveTaskTemplateName(task, map)).toBe('Matrícula');
  });

  it('taskDescriptionForDisplay hides template metadata block', () => {
    const desc = buildTemplateTaskDescription({
      templateId: 'tpl-1',
      batchId: 'batch-1',
      templateName: 'Processo X',
      itemOrder: 0,
      notes: 'Ligar para o aluno',
    });
    expect(taskDescriptionForDisplay({ description: desc })).toBe('Ligar para o aluno');
  });
});
