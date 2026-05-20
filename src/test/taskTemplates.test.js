import { describe, it, expect } from 'vitest';
import {
  addDaysToYmd,
  parseTemplateItems,
  serializeTemplateItems,
  mapTemplateDoc,
  progressLabelForLead,
  buildTemplateTaskDescription,
  parseTemplateTaskMeta,
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
});
