import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronUp, ChevronDown, ChevronRight, Upload, ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useProductsStore } from '../store/useProductsStore';
import { useUiStore } from '../store/useUiStore';
import { filterParentCatalog } from '../lib/productCatalog';
import { formatBRL } from '../lib/moneyBr';
import { refreshStockStores } from '../lib/syncStockStores';
import ProductThumb from '../components/products/ProductThumb';
import ProductFormModal from '../components/products/ProductFormModal';
import ProductImportModal from '../components/products/ProductImportModal';
import ProductDeleteDialog from '../components/products/ProductDeleteDialog';
import ProductStockMovesDrawer from '../components/products/ProductStockMovesDrawer';
import EmptyState from '../components/shared/EmptyState';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import { friendlyError } from '../lib/errorMessages';

const LIFECYCLE_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  sem_estoque: 'Sem estoque',
};


function ProductActionsMenu({ product, isOpen, onToggle, onClose, onDuplicate, onDelete, deleteBusy }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return (
    <div className="products-actions-menu" ref={rootRef}>
      <button
        type="button"
        className="products-icon-btn"
        title="Mais ações"
        aria-label="Mais ações"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {isOpen ? (
        <div className="products-actions-menu__panel" role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="menuitem"
            className="products-actions-menu__item"
            onClick={() => {
              onClose();
              onDuplicate(product);
            }}
          >
            Duplicar produto
          </button>
          <button
            type="button"
            role="menuitem"
            className="products-actions-menu__item products-actions-menu__item--danger"
            disabled={deleteBusy}
            onClick={() => {
              onClose();
              onDelete(product);
            }}
          >
            Excluir produto
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Products() {
  const modules = useLeadStore((s) => s.modules);
  const {
    products,
    loadProducts,
    createProduct,
    updateProduct,
    deactivateProduct,
    checkDeleteProduct,
    deleteProduct,
    loading,
    error,
  } = useProductsStore();
  const addToast = useUiStore((s) => s.addToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeProduct, setActiveProduct] = useState(null);
  const [sort, setSort] = useState({ key: 'nome', dir: 'asc' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteHasSales, setDeleteHasSales] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFilterIds, setImportFilterIds] = useState(null);
  const [movesProduct, setMovesProduct] = useState(null);
  const [actionsMenuId, setActionsMenuId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const canAccess = modules?.inventory === true || modules?.sales === true;

  const refresh = useCallback(async () => {
    await loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!canAccess) return;
    void refresh();
  }, [canAccess, refresh]);

  useEffect(() => {
    if (!canAccess) return;
    const flag = String(searchParams.get('import') || '').trim().toLowerCase();
    if (flag !== '1' && flag !== 'csv' && flag !== 'true') return;
    setImportOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('import');
        return next;
      },
      { replace: true }
    );
  }, [canAccess, searchParams, setSearchParams]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const c = String(p.categoria || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const filtered = useMemo(() => {
    let list = filterParentCatalog(products, {
      search,
      category: categoryFilter,
      statusFilter: statusFilter === 'all' ? '' : statusFilter,
      typeFilter: typeFilter === 'all' ? '' : typeFilter,
    });
    if (importFilterIds?.length) {
      const idSet = new Set(importFilterIds);
      list = list.filter(
        (p) => idSet.has(p.id) || (p.variants || []).some((v) => idSet.has(v.id))
      );
    }
    return list;
  }, [products, search, categoryFilter, statusFilter, typeFilter, importFilterIds]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sort.dir === 'asc' ? 1 : -1;
    const cmpStr = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
    const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);

    list.sort((a, b) => {
      let out = 0;
      switch (sort.key) {
        case 'categoria':
          out = cmpStr(a.categoria, b.categoria);
          break;
        case 'sale_price':
          out = cmpNum(a.sale_price, b.sale_price);
          break;
        case 'current_quantity':
          out = cmpNum(a.current_quantity, b.current_quantity);
          break;
        case 'lifecycle':
          out = cmpStr(a.lifecycle, b.lifecycle);
          break;
        case 'tipo':
          out = cmpNum(a.is_for_sale ? 1 : 0, b.is_for_sale ? 1 : 0);
          break;
        case 'total_quantity':
          out = cmpNum(a.total_quantity, b.total_quantity);
          break;
        default:
          out = cmpStr(a.nome, b.nome);
      }
      return out * dir;
    });
    return list;
  }, [filtered, sort]);

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  };

  const SortHeader = ({ label, sortKey: key, align }) => (
    <th style={{ textAlign: align || 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />
        ) : null}
      </span>
    </th>
  );

  const openCreate = () => {
    setActiveProduct(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (product, { variant } = {}) => {
    setActiveProduct(
      variant
        ? { ...variant, id: variant.id }
        : product
    );
    setModalMode('edit');
    setModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('edit', (variant || product).id);
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

  const handleSave = async (payload, { isEdit: editFlag, isParent, phase } = {}) => {
    const isEdit = editFlag ?? modalMode === 'edit';

    if (phase === 'variants') {
      const result = await useProductsStore.getState().saveProductVariants(payload);
      if (result.duplicate_indexes?.length) {
        return result;
      }
      if (!result.ok) {
        addToast({ type: 'error', message: result.erro || 'Erro ao salvar variantes' });
        return result;
      }
      const errCount = (result.errors || []).length;
      const savedN = result.saved ?? 0;
      if (errCount > 0) {
        const first = result.errors[0];
        addToast({
          type: 'warning',
          message: `${savedN} variante(s) salva(s), ${errCount} erro(s)${first?.label ? ` em ${first.label}` : ''}`,
          duration: 8000,
        });
      } else {
        addToast({ type: 'success', message: `${savedN} variante(s) salva(s)` });
        closeModal();
        await refreshStockStores();
      }
      return result;
    }

    if (phase === 'parent' && isEdit && isParent) {
      const saved = await updateProduct(payload);
      if (!saved) {
        addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao salvar produto' });
        return { ok: false };
      }
      return { ok: true };
    }

    const saved = isEdit ? await updateProduct(payload) : await createProduct(payload);
    if (!saved) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao salvar produto' });
      return { ok: false };
    }
    addToast({ type: 'success', message: isEdit ? 'Produto atualizado' : 'Produto criado' });
    closeModal();
    await refreshStockStores();
    return { ok: true };
  };

  const handleDeactivate = async (itemId) => {
    const updated = await deactivateProduct(itemId);
    if (!updated) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao desativar' });
      return;
    }
    addToast({ type: 'success', message: 'Produto desativado' });
    closeModal();
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    await refreshStockStores();
  };

  const openDeleteDialog = async (product, e) => {
    e?.stopPropagation?.();
    setDeleteBusy(true);
    setDeleteTarget(product);
    const check = await checkDeleteProduct(product.id);
    setDeleteBusy(false);
    if (!check) {
      addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao verificar produto' });
      setDeleteTarget(null);
      return;
    }
    setDeleteHasSales(check.has_sales);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteHasSales(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const result = await deleteProduct(deleteTarget.id);
    setDeleteBusy(false);
    if (!result?.ok) {
      const err = result?.error || useProductsStore.getState().error || '';
      if (result?.has_sales || /vendas registradas/i.test(err)) {
        setDeleteHasSales(true);
        return;
      }
      addToast({ type: 'error', message: err || 'Erro ao excluir produto' });
      return;
    }
    addToast({ type: 'success', message: 'Produto excluído' });
    closeDeleteDialog();
    closeModal();
    await refreshStockStores();
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-action-primary" onClick={() => setImportOpen(true)}>
            <Upload size={14} aria-hidden />
            Importar em lote
          </button>
          <button type="button" className="btn-action-ghost" onClick={openCreate}>
            <Plus size={14} aria-hidden />
            Novo produto
          </button>
        </div>
      </div>

      {error ? (
        <ErrorBanner
          className="mt-2"
          message={friendlyError(error, 'load')}
          onRetry={() => void refresh()}
        />
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
                placeholder="Nome, código, categoria…"
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

        {loading ? (
          <PageSkeleton variant="cards" rows={6} />
        ) : filtered.length === 0 && !error ? (
          products.length === 0 ? (
            <EmptyState
              variant="default"
              tone="dashed"
              title="Nenhum produto cadastrado ainda"
              description="Cadastre os produtos da academia para usá-los nas vendas e no controle de estoque."
              primaryAction={{ label: 'Cadastrar primeiro produto', onClick: openCreate }}
              secondaryAction={{ label: 'Importar em lote (CSV)', onClick: () => setImportOpen(true) }}
              role="status"
            />
          ) : (
            <EmptyState
              variant="compact"
              tone="dashed"
              title="Nenhum produto neste filtro"
              description="Ajuste os filtros ou cadastre um novo produto."
              role="status"
            />
          )
        ) : (
          <>
          <div className="navi-desktop-table-wrap products-desktop-table-wrap">
            <table className="navi-table products-table">
              <thead>
                <tr>
                  <th className="products-table__thumb-head" />
                  <SortHeader label="Produto" sortKey="nome" />
                  <SortHeader label="Categoria" sortKey="categoria" />
                  <SortHeader label="Preço" sortKey="sale_price" />
                  <SortHeader label="Saldo total" sortKey="total_quantity" />
                  <SortHeader label="Status" sortKey="lifecycle" />
                  <th className="products-table__actions-head" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const lifecycleKey = p.lifecycle || 'ativo';
                  const hasVariants = (p.variants || []).length > 1;
                  const expanded = expandedIds.has(p.id);
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="products-table__row" onClick={() => openEdit(p)}>
                        <td className="products-table__thumb-cell" onClick={(e) => e.stopPropagation()}>
                          {hasVariants ? (
                            <button
                              type="button"
                              className="products-icon-btn"
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Recolher variantes' : 'Expandir variantes'}
                              onClick={() => toggleExpanded(p.id)}
                            >
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          ) : null}
                          <ProductThumb imageUrl={p.image_url} alt={p.nome} size={36} />
                        </td>
                        <td>
                          <div className="products-table__name-row">
                            <span className="products-table__name">{p.nome}</span>
                            {hasVariants ? (
                              <span className="products-table__variation">{p.variant_count} variantes</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-small text-muted">{p.categoria || '—'}</td>
                        <td className="text-small products-table__price">
                          {p.sale_price != null ? formatBRL(p.sale_price) : '—'}
                        </td>
                        <td className="products-table__qty">{p.total_quantity ?? p.current_quantity ?? 0}</td>
                        <td>
                          <span className={`products-lifecycle-badge products-lifecycle-badge--${lifecycleKey}`}>
                            {LIFECYCLE_LABELS[lifecycleKey] || lifecycleKey}
                          </span>
                        </td>
                        <td className="products-table__actions" onClick={(e) => e.stopPropagation()}>
                          <div className="products-table__actions-inner">
                            <ProductActionsMenu
                              product={p}
                              isOpen={actionsMenuId === p.id}
                              onToggle={() => setActionsMenuId((id) => (id === p.id ? null : p.id))}
                              onClose={() => setActionsMenuId(null)}
                              onDuplicate={openDuplicate}
                              onDelete={(item) => void openDeleteDialog(item.variants?.[0] || item)}
                              deleteBusy={deleteBusy && deleteTarget?.id === p.id}
                            />
                          </div>
                        </td>
                      </tr>
                      {expanded && hasVariants
                        ? (p.variants || []).map((v) => {
                            const vLife = v.lifecycle || 'ativo';
                            return (
                              <tr
                                key={v.id}
                                className="products-table__row products-table__row--variant"
                                onClick={() => openEdit(p, { variant: v })}
                              >
                                <td />
                                <td className="text-small" style={{ paddingLeft: 28 }}>
                                  {[v.size || v.Tamanho, v.color].filter(Boolean).join(' / ') || 'Único'}
                                </td>
                                <td />
                                <td />
                                <td className="products-table__qty">{v.current_quantity}</td>
                                <td>
                                  <span className={`products-lifecycle-badge products-lifecycle-badge--${vLife}`}>
                                    {LIFECYCLE_LABELS[vLife] || vLife}
                                  </span>
                                </td>
                                <td className="products-table__actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="products-icon-btn"
                                    title="Movimentações"
                                    onClick={() => setMovesProduct(v)}
                                  >
                                    <ArrowLeftRight size={16} aria-hidden />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="navi-mobile-list products-mobile-list" aria-label="Lista de produtos">
            {sorted.map((p) => {
              const lifecycleKey = p.lifecycle || 'ativo';
              const hasVariants = (p.variants || []).length > 1;
              return (
                <article key={p.id} className="navi-mobile-card products-mobile-card">
                  <div className="products-mobile-card__main" onClick={() => openEdit(p)} role="presentation">
                    <ProductThumb imageUrl={p.image_url} alt={p.nome} size={36} />
                    <div className="products-mobile-card__body">
                      <div className="products-mobile-card__title-row">
                        <span className="products-mobile-card__title">{p.nome}</span>
                        {hasVariants ? (
                          <span className="products-mobile-card__variation">{p.variant_count} var.</span>
                        ) : null}
                      </div>
                      <div className="products-mobile-card__meta text-small text-muted">
                        {p.categoria || '—'}
                      </div>
                      <div className="products-mobile-card__row text-small">
                        <span>{p.sale_price != null ? formatBRL(p.sale_price) : '—'}</span>
                        <span className="products-mobile-card__dot" aria-hidden>•</span>
                        <span>Saldo: {p.total_quantity ?? p.current_quantity ?? 0}</span>
                      </div>
                      <span className={`products-lifecycle-badge products-lifecycle-badge--${lifecycleKey}`}>
                        {LIFECYCLE_LABELS[lifecycleKey] || lifecycleKey}
                      </span>
                    </div>
                  </div>
                  <div className="navi-mobile-card__actions products-mobile-card__actions">
                    <button
                      type="button"
                      className="products-icon-btn"
                      title="Ver movimentações"
                      aria-label="Ver movimentações"
                      onClick={() => setMovesProduct(p)}
                    >
                      <ArrowLeftRight size={16} aria-hidden />
                    </button>
                    <ProductActionsMenu
                      product={p}
                      isOpen={actionsMenuId === p.id}
                      onToggle={() => setActionsMenuId((id) => (id === p.id ? null : p.id))}
                      onClose={() => setActionsMenuId(null)}
                      onDuplicate={openDuplicate}
                      onDelete={(item) => void openDeleteDialog(item)}
                      deleteBusy={deleteBusy && deleteTarget?.id === p.id}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>

      <ProductFormModal
        open={modalOpen}
        onClose={closeModal}
        product={activeProduct}
        categories={categories}
        mode={modalMode}
        loading={loading || deleteBusy}
        onSave={handleSave}
        onDeactivate={handleDeactivate}
        onRequestDelete={(p) => void openDeleteDialog(p)}
      />

      <ProductDeleteDialog
        open={deleteDialogOpen}
        product={deleteTarget}
        hasSales={deleteHasSales}
        loading={deleteBusy || loading}
        onClose={closeDeleteDialog}
        onConfirmDelete={() => void confirmDelete()}
        onConfirmDeactivate={() => deleteTarget && void handleDeactivate(deleteTarget.id)}
      />

      <ProductStockMovesDrawer
        open={Boolean(movesProduct)}
        product={movesProduct}
        onClose={() => setMovesProduct(null)}
      />

      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async ({ ids, reload, viewFilter }) => {
          if (reload) await loadProducts();
          if (viewFilter && ids?.length) {
            setImportFilterIds(ids);
            setSearch('');
            setCategoryFilter('all');
            setStatusFilter('all');
            setTypeFilter('all');
          }
        }}
      />

      {importFilterIds?.length ? (
        <div className="card mt-2" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="text-small">
            Exibindo {importFilterIds.length} produto(s) da importação recente
          </span>
          <button type="button" className="btn-outline btn-sm" onClick={() => setImportFilterIds(null)}>
            Limpar filtro
          </button>
        </div>
      ) : null}

    </div>
  );
}
