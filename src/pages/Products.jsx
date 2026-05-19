import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, Plus, Search, Trash2, ChevronUp, ChevronDown, Upload, Pencil } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useProductsStore } from '../store/useProductsStore';
import { useUiStore } from '../store/useUiStore';
import { filterProductsClient } from '../lib/stockProducts';
import { formatBRL } from '../lib/moneyBr';
import { refreshStockStores } from '../lib/syncStockStores';
import ProductThumb from '../components/products/ProductThumb';
import ProductFormModal from '../components/products/ProductFormModal';
import ProductImportModal from '../components/products/ProductImportModal';
import ProductDeleteDialog from '../components/products/ProductDeleteDialog';
import EmptyState from '../components/shared/EmptyState';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import { friendlyError } from '../lib/errorMessages';

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
    let list = filterProductsClient(products, {
      search,
      category: categoryFilter,
      statusFilter: statusFilter === 'all' ? '' : statusFilter,
      typeFilter: typeFilter === 'all' ? '' : typeFilter,
    });
    if (importFilterIds?.length) {
      const idSet = new Set(importFilterIds);
      list = list.filter((p) => idSet.has(p.id));
    }
    return list;
  }, [products, search, categoryFilter, statusFilter, typeFilter, importFilterIds]);

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
        default:
          out = cmpStr(a.display_label || a.nome, b.display_label || b.nome);
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
    await refreshStockStores();
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
    const ok = await deleteProduct(deleteTarget.id);
    setDeleteBusy(false);
    if (!ok) {
      const err = useProductsStore.getState().error || '';
      if (/vendas registradas/i.test(err)) {
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
                  <th style={{ width: 56 }} />
                  <SortHeader label="Produto" sortKey="nome" />
                  <SortHeader label="Categoria" sortKey="categoria" />
                  <SortHeader label="Tipo" sortKey="tipo" />
                  <SortHeader label="Preço venda" sortKey="sale_price" />
                  <SortHeader label="Saldo" sortKey="current_quantity" />
                  <SortHeader label="Status" sortKey="lifecycle" />
                  <th className="products-table__actions-head">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const st = LIFECYCLE_STYLES[p.lifecycle] || LIFECYCLE_STYLES.ativo;
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(p)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ProductThumb imageUrl={p.image_url} alt={p.display_label} size={40} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.display_label}</div>
                      </td>
                      <td className="text-small text-muted">{p.categoria || '—'}</td>
                      <td>
                        {p.is_for_sale ? (
                          <span className="products-type-badge products-type-badge--sale">Venda</span>
                        ) : (
                          <span className="products-type-badge products-type-badge--internal">Insumo</span>
                        )}
                      </td>
                      <td className="text-small">{p.sale_price != null ? formatBRL(p.sale_price) : '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.current_quantity}</td>
                      <td>
                        <span className="text-small" style={{ fontWeight: 600, color: st.color }}>
                          {LIFECYCLE_LABELS[p.lifecycle] || p.lifecycle}
                        </span>
                      </td>
                      <td className="products-table__actions" onClick={(e) => e.stopPropagation()}>
                        <div className="products-table__actions-inner">
                          <button type="button" className="btn-outline btn-sm" title="Duplicar" onClick={() => openDuplicate(p)}>
                            <Copy size={14} aria-hidden />
                          </button>
                          <Link
                            to={`/estoque?item=${p.id}`}
                            className="btn-outline btn-sm"
                            title="Ver no estoque"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Estoque
                          </Link>
                          <button
                            type="button"
                            className="btn-outline btn-sm products-delete-btn"
                            title="Excluir produto"
                            onClick={(e) => void openDeleteDialog(p, e)}
                            disabled={deleteBusy && deleteTarget?.id === p.id}
                          >
                            <Trash2 size={14} aria-hidden style={{ color: 'var(--status-danger-text, var(--danger))' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="navi-mobile-list products-mobile-list" aria-label="Lista de produtos">
            {sorted.map((p) => {
              const st = LIFECYCLE_STYLES[p.lifecycle] || LIFECYCLE_STYLES.ativo;
              const variation = p.Tamanho || p.sku || 'Único';
              return (
                <article key={p.id} className="navi-mobile-card products-mobile-card">
                  <div className="products-mobile-card__main">
                    <ProductThumb imageUrl={p.image_url} alt={p.display_label} size={48} />
                    <div className="products-mobile-card__body">
                      <div className="products-mobile-card__title">{p.nome || p.display_label}</div>
                      <div className="products-mobile-card__meta text-small text-muted">
                        {p.categoria || '—'} · {variation}
                      </div>
                      <div className="products-mobile-card__row text-small">
                        <span>{p.sale_price != null ? formatBRL(p.sale_price) : '—'}</span>
                        <span className="products-mobile-card__dot" aria-hidden>•</span>
                        <span>Saldo: {p.current_quantity}</span>
                      </div>
                      <span className="text-small" style={{ fontWeight: 600, color: st.color }}>
                        {LIFECYCLE_LABELS[p.lifecycle] || p.lifecycle}
                      </span>
                    </div>
                  </div>
                  <div className="navi-mobile-card__actions products-mobile-card__actions">
                    <button type="button" className="btn-outline btn-sm" title="Editar" onClick={() => openEdit(p)}>
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button type="button" className="btn-outline btn-sm" title="Duplicar" onClick={() => openDuplicate(p)}>
                      <Copy size={14} aria-hidden />
                    </button>
                    <Link to={`/estoque?item=${p.id}`} className="btn-outline btn-sm" title="Ver no estoque">
                      Estoque
                    </Link>
                    <button
                      type="button"
                      className="btn-outline btn-sm products-delete-btn"
                      title="Excluir produto"
                      onClick={(e) => void openDeleteDialog(p, e)}
                      disabled={deleteBusy && deleteTarget?.id === p.id}
                    >
                      <Trash2 size={14} aria-hidden style={{ color: 'var(--status-danger-text, var(--danger))' }} />
                    </button>
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

      <style>{`
        .products-desktop-table-wrap { overflow-x: auto; padding-right: 4px; }
        .products-table { width: 100%; table-layout: auto; min-width: 720px; }
        .products-mobile-list { display: none; }
        .products-mobile-card__main {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px 14px 10px;
        }
        .products-mobile-card__body { flex: 1; min-width: 0; }
        .products-mobile-card__title { font-weight: 600; font-size: 14px; line-height: 1.35; }
        .products-mobile-card__meta { margin-top: 2px; }
        .products-mobile-card__row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-variant-numeric: tabular-nums;
        }
        .products-mobile-card__dot { opacity: 0.45; }
        .products-mobile-card__actions {
          border-top: 0.5px solid var(--border-light);
          padding: 8px 14px 10px;
        }
        @media (max-width: 767px) {
          .products-desktop-table-wrap { display: none !important; }
          .products-mobile-list { display: flex; flex-direction: column; }
        }
        .products-table__actions-head,
        .products-table__actions {
          text-align: right;
          white-space: nowrap;
          width: 1%;
          min-width: 200px;
          padding-right: 8px;
        }
        .products-table__actions-inner {
          display: inline-flex;
          gap: 4px;
          justify-content: flex-end;
          flex-wrap: nowrap;
        }
        .products-delete-btn { flex-shrink: 0; }
        .products-type-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .products-type-badge--sale {
          background: color-mix(in srgb, var(--v500) 14%, transparent);
          color: var(--v700);
        }
        .products-type-badge--internal {
          background: var(--surface-2);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
