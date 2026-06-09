import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resetForAcademyChange: vi.fn(),
  resetForAcademy: vi.fn(),
  loadByAcademy: vi.fn(),
  removeQueries: vi.fn(),
}));

vi.mock('../store/useStudentStore.js', () => ({
  useStudentStore: {
    getState: () => ({ resetForAcademyChange: mocks.resetForAcademyChange }),
  },
}));

vi.mock('../store/useInventoryStore.js', () => ({
  useInventoryStore: {
    setState: vi.fn(),
    getState: () => ({ items: [] }),
  },
}));

vi.mock('../store/useProductsStore.js', () => ({
  useProductsStore: {
    setState: vi.fn(),
    getState: () => ({ products: [] }),
  },
}));

vi.mock('../store/useChatWidgetStore.js', () => ({
  useChatWidgetStore: {
    getState: () => ({ resetForAcademy: mocks.resetForAcademy }),
  },
}));

vi.mock('../store/useTaskStore.js', () => ({
  useTaskStore: {
    setState: vi.fn(),
    getState: () => ({ tasks: [] }),
  },
}));

vi.mock('../store/useAccountingStore.js', () => ({
  useAccountingStore: {
    getState: () => ({ loadByAcademy: mocks.loadByAcademy }),
  },
}));

vi.mock('../lib/queryClient.ts', () => ({
  queryClient: { removeQueries: mocks.removeQueries },
}));

import { useInventoryStore } from '../store/useInventoryStore.js';
import { useProductsStore } from '../store/useProductsStore.js';
import { useTaskStore } from '../store/useTaskStore.js';
import { resetStoresForAcademyChange } from '../lib/resetStoresForAcademyChange.js';

describe('resetStoresForAcademyChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('limpa stores tenant-scoped e recarrega contabilidade', () => {
    resetStoresForAcademyChange('acad-b');

    expect(mocks.resetForAcademyChange).toHaveBeenCalled();
    expect(useInventoryStore.setState).toHaveBeenCalledWith(
      expect.objectContaining({ items: [], loading: false })
    );
    expect(useProductsStore.setState).toHaveBeenCalledWith(
      expect.objectContaining({ products: [], variants: [], loading: false })
    );
    expect(mocks.resetForAcademy).toHaveBeenCalledWith('acad-b');
    expect(useTaskStore.setState).toHaveBeenCalledWith(
      expect.objectContaining({ tasks: [], tasksFetchKey: null })
    );
    expect(mocks.removeQueries).toHaveBeenCalledWith({ queryKey: ['contracts'] });
    expect(mocks.loadByAcademy).toHaveBeenCalledWith('acad-b');
  });

  it('não chama loadByAcademy sem id', () => {
    resetStoresForAcademyChange('');
    expect(mocks.loadByAcademy).not.toHaveBeenCalled();
  });
});
