import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Query } from 'node-appwrite';

describe('listTaskTemplates enabled filter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID = 'tpl_col';
  });

  it('adds Query.equal(enabled, true) by default', async () => {
    const listDocuments = vi.fn().mockResolvedValue({ documents: [] });
    const { listTaskTemplates } = await import('../../lib/server/taskTemplateStore.js');

    await listTaskTemplates({ listDocuments }, 'db1', 'acad1');

    const queries = listDocuments.mock.calls[0][2];
    expect(queries.some((q) => String(q).includes('enabled') && String(q).includes('true'))).toBe(true);
    expect(queries).toContainEqual(Query.equal('academy_id', 'acad1'));
  });

  it('omits enabled filter when includeDisabled is true', async () => {
    const listDocuments = vi.fn().mockResolvedValue({ documents: [] });
    const { listTaskTemplates } = await import('../../lib/server/taskTemplateStore.js');

    await listTaskTemplates({ listDocuments }, 'db1', 'acad1', { includeDisabled: true });

    const queries = listDocuments.mock.calls[0][2];
    expect(queries.some((q) => String(q).includes('enabled'))).toBe(false);
  });

  it('default list uses enabled query (Appwrite returns only active rows)', async () => {
    const listDocuments = vi.fn().mockResolvedValue({
      documents: [
        { $id: 'a', academy_id: 'acad1', name: 'Ativo', trigger: 'manual', enabled: true, items_json: '[]' },
      ],
    });
    const { listTaskTemplates } = await import('../../lib/server/taskTemplateStore.js');

    const onlyEnabled = await listTaskTemplates({ listDocuments }, 'db1', 'acad1');
    expect(onlyEnabled.map((t) => t.id)).toEqual(['a']);
    expect(onlyEnabled[0].enabled).toBe(true);
  });
});
