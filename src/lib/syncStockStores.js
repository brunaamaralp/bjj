import { useProductsStore } from '../store/useProductsStore';
import { useInventoryStore } from '../store/useInventoryStore';

/** Recarrega produtos e inventário após mutação em qualquer tela de estoque. */
export async function refreshStockStores() {
  const { loadProducts } = useProductsStore.getState();
  const { loadItems } = useInventoryStore.getState();
  await Promise.all([loadProducts(), loadItems()]);
}
