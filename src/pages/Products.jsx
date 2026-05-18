import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, Plus, Search } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useProductsStore } from '../store/useProductsStore';
import { useUiStore } from '../store/useUiStore';
import { filterProductsClient } from '../lib/stockProducts';
import { formatBRL } from '../lib/moneyBr';
import ProductThumb from '../components/products/ProductThumb';
import ProductFormModal from '../components/products/ProductFormModal';
import EmptyState from '../components/shared/EmptyState';

const LIFECYCLE_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  sem_estoque: 'Sem estoque',
};

const LIFECYCLE_STYLES = {
  ativo: { color: 'var(--success)' },
  inativo: { color: 'var(--text-muted)' },
  sem_estoque: { color: 'var(--warning, #c9a227)' },
};

export default function Products() {
  const modules = useLeadStore((s) => s.modules);
  const { products, loadProducts, createProduct, updateProduct, deactivateProduct, loading, error } = useProductsStore();
  const addToast = useUiStore((s) => s.addToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeProduct, setActiveProduct] = useState(null);

  const canAccess = modules?.inventory === true || modules?.sales === true;

  const refresh = useCallback(async () => {
    await loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!canAccess) return;
    void refresh();
  }, [canAccess, refresh]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const c = String(p.categoria || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const filtered = useMemo(
    () =>
      filterProductsClient(products, {
        search,
        category: categoryFilter,
        statusFilter: statusFilter === 'all' ? '' : statusFilter,
        typeFilter: typeFilter === 'all' ? '' : typeFilter,
      }),
    [products, search, categoryFilter, statusFilter, typeFilter]
  );

  const openCreate = () => {
    setActiveProduct(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setActiveProduct(product);
    setModalMode('edit');
    setModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('edit', product.id);
      return next;
    });
  };

  const openDuplicate = (product) => {
    setActiveProduct(product);
    setModalMode('duplicate');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveProduct(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      next.delete('duplicate');
      return next;
    });
  };

  useEffect(() => {
    if (!products.length) return;
    const editId = searchParams.get('edit');
    const dupId = searchParams.get('duplicate');
    const id = editId || dupId;
    if (!id) return;
    const p = products.find((x) => x.id === id);
    if (!p) return;
    if (dupId) openDuplicate(p);
    else openEdit(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchParams]);

  const handleSave = async (payload) => {
    const isEdit = modalMode === 'edit';
    const saved = isEdit ? await updateProduct(payload) : await createProduct(payload);
    if (!saved) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao salvar produto' });
      return;
    }
    addToast({ type: 'success', message: isEdit ? 'Produto atualizado' : 'Produto criado' });
    closeModal();
    await refresh();
  };

  const handleDeactivate = async (itemId) => {
    const updated = await deactivateProduct(itemId);
    if (!updated) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao desativar' });
      return;
    }
    addToast({ type: 'success', message: 'Produto desativado' });
    closeModal();
    await refresh();
  };

  if (!canAccess) {
    return null;
  }

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in flex justify-between items-start gap-2" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 className="navi-page-title">Produtos</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6 }}>
            Cadastro único para estoque e vendas
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={openCreate}>
          <Plus size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          Novo produto
        </button>
      </div>

      {error ? (
        <p className="text-small mt-2" style={{ color: 'var(--danger)' }} role="alert">{error}</p>
      ) : null}

      <div className="card mt-4" style={{ padding: 12 }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0, flex: '1 1 200px', minWidth: 160 }}>
            <label className="text-xs">Busca</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} aria-hidden />
              <input
                className="form-input"
                style={{ paddingLeft: 30 }}
                placeholder="Nome, SKU, categoria…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Categoria</label>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="sem_estoque">Sem estoque</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="text-xs">Tipo</label>
            <select className="form-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="for_sale">Para venda</option>
              <option value="internal">Insumo interno</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            title={products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto neste filtro'}
            description="Cadastre o primeiro produto ou ajuste os filtros."
            role="status"
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="navi-table" style={{ width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 56 }} />
                  <th style={{ textAlign: 'left' }}>Produto</th>
                  <th>Categoria</th>
                  <th>Preço venda</th>
                  <th>Saldo</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = LIFECYCLE_STYLES[p.lifecycle] || LIFECYCLE_STYLES.ativo;
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(p)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ProductThumb imageUrl={p.image_url} alt={p.display_label} size={40} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.display_label}</div>
                        {p.is_for_sale ? (
                          <span className="text-xs" style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2)', fontWeight: 600 }}>
                            Venda
                          </span>
                        ) : null}
                      </td>
                      <td className="text-small text-muted">{p.categoria || '—'}</td>
                      <td className="text-small">{p.sale_price != null ? formatBRL(p.sale_price) : '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.current_quantity}</td>
                      <td>
                        <span className="text-small" style={{ fontWeight: 600, color: st.color }}>
                          {LIFECYCLE_LABELS[p.lifecycle] || p.lifecycle}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button type="button" className="btn-outline btn-sm" title="Duplicar" onClick={() => openDuplicate(p)}>
                            <Copy size={14} aria-hidden />
                          </button>
                          <Link to={`/estoque`} className="btn-outline btn-sm" title="Ver no estoque" onClick={(e) => e.stopPropagation()}>
                            Estoque
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductFormModal
        open={modalOpen}
        onClose={closeModal}
        product={activeProduct}
        categories={categories}
        mode={modalMode}
        loading={loading}
        onSave={handleSave}
        onDeactivate={handleDeactivate}
      />
    </div>
  );
}
