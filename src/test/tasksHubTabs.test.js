import { describe, it, expect } from 'vitest';
import { resolveTasksHubTab, isTasksProcessosTab } from '../lib/tasksHubTabs.js';

describe('tasksHubTabs', () => {
  it('default é operacao', () => {
    expect(resolveTasksHubTab('')).toBe('operacao');
    expect(resolveTasksHubTab(undefined)).toBe('operacao');
  });

  it('processos', () => {
    expect(resolveTasksHubTab('processos')).toBe('processos');
    expect(isTasksProcessosTab('processos')).toBe(true);
  });
});
