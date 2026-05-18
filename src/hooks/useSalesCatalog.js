import { useCallback, useEffect, useState } from 'react';
import { databases, DB_ID, STOCK_ITEMS_COL } from '../lib/appwrite';
import { Query } from 'appwrite';
import { catalogProductsForSale, mapCatalogProduct } from '../lib/salesCatalog';

export function useSalesCatalog(academyId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!academyId || !DB_ID || !STOCK_ITEMS_COL) {
      setProducts([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const PAGE = 100;
      let all = [];
      let cursor = null;
      for (;;) {
        const queries = [Query.limit(PAGE)];
        try {
          queries.unshift(Query.equal('academy_id', academyId));
        } catch {
          void 0;
        }
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const res = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, queries);
        const batch = res.documents || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        cursor = batch[batch.length - 1].$id;
      }
      const mapped = catalogProductsForSale(
        all
          .filter((d) => !d.academy_id || String(d.academy_id) === academyId)
          .map(mapCatalogProduct)
      );
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

  return { products, loading, error, reload: load };
}
