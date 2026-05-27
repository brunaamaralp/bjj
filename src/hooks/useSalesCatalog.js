import { useCallback, useEffect, useState } from 'react';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { catalogParentsFromVariants } from '../lib/salesCatalog';
import { REFRESH_SALES_CATALOG_EVENT } from '../lib/salesCatalogRefresh';

async function fetchProductsViaApi(academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  if (!academyId) throw new Error('academy_required');

  const res = await fetch('/api/products', {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data.variants || data.products || [];
}

export function useSalesCatalog(academyId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) {
      setProducts([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchProductsViaApi(academyId);
      const mapped = catalogParentsFromVariants(list);
      setProducts(mapped);
      return mapped;
    } catch (e) {
      setError(String(e?.message || e));
      setProducts([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onRefresh = () => {
      void load();
    };
    window.addEventListener(REFRESH_SALES_CATALOG_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_SALES_CATALOG_EVENT, onRefresh);
  }, [load]);

  return { products, loading, error, reload: load, refreshCatalog: load };
}
