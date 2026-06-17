import { describe, it, expect } from 'vitest';
import { applyTaskCompletionFields } from '../../lib/server/taskCompletionFields.js';

describe('applyTaskCompletionFields', () => {
  const me = { $id: 'user-1', name: 'Maria Alice' };

  it('sets completed_by when marking done', () => {
    const out = applyTaskCompletionFields({ status: 'done' }, { status: 'pending' }, me);
    expect(out.completed_by).toBe('user-1');
    expect(out.completed_by_name).toBe('Maria Alice');
  });

  it('clears completed_by when reopening', () => {
    const out = applyTaskCompletionFields(
      { status: 'pending' },
      { status: 'done', completed_by: 'user-1', completed_by_name: 'Maria Alice' },
      me
    );
    expect(out.completed_by).toBe('');
    expect(out.completed_by_name).toBe('');
  });

  it('ignores patch without status', () => {
    const out = applyTaskCompletionFields({ title: 'Novo' }, { status: 'pending' }, me);
    expect(out.completed_by).toBeUndefined();
  });
});
