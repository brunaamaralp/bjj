import { useStudentStore } from '../store/useStudentStore.js';
import { useInventoryStore } from '../store/useInventoryStore.js';
import { useProductsStore } from '../store/useProductsStore.js';
import { useChatWidgetStore } from '../store/useChatWidgetStore.js';
import { useTaskStore } from '../store/useTaskStore.js';
import { useAccountingStore } from '../store/useAccountingStore.js';
import { queryClient } from './queryClient.ts';

/**
 * Limpa estado tenant-scoped ao trocar de academia (evita vazamento cross-tenant na UI).
 * @param {string} academyId
 */
export function resetStoresForAcademyChange(academyId) {
  const id = String(academyId || '').trim();

  useStudentStore.getState().resetForAcademyChange();

  useInventoryStore.setState({
    items: [],
    lastResult: null,
    error: null,
    loading: false,
  });

  useProductsStore.setState({
    products: [],
    variants: [],
    loading: false,
    error: null,
  });

  useChatWidgetStore.getState().resetForAcademy(id);

  useTaskStore.setState({
    tasks: [],
    tasksCursor: null,
    tasksHasMore: false,
    tasksFetchKey: null,
    loading: false,
    loadingMore: false,
    error: null,
  });

  queryClient.removeQueries({ queryKey: ['contracts'] });

  if (id) {
    const load = useAccountingStore.getState().loadByAcademy;
    if (typeof load === 'function') load(id);
  }
}
