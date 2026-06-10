import { useCallback, useEffect, useState } from 'react';
import { createSessionJwt } from '../lib/appwrite';
import { normalizeSalesCatalogFromApi } from '../lib/salesCatalog';
import { REFRESH_SALES_CATALOG_EVENT } from '../lib/salesCatalogRefresh';
import { friendlyError } from '../lib/errorMessages.js';

async function fetchProductsViaApi(academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  if (!academyId) throw new Error('academy_required');

  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'x-academy-id': academyId,
  };

  let res = await fetch('/api/products', { headers });
  let data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }

  if (data.needs_migration) {
    try {
      const migrateRes = await fetch('/api/products', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'migrate' }),
      });
      const migrated = await migrateRes.json().catch(() => ({}));
      if (migrateRes.ok) data = migrated;
    } catch {
      void 0;
    }
  }

  return data;
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
      const data = await fetchProductsViaApi(academyId);
      const mapped = normalizeSalesCatalogFromApi(data);
      setProducts(mapped);
      return mapped;
    } catch (e) {
      setError(friendlyError(e, 'load'));
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
