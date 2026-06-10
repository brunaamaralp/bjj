import '../styles/sales.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronUp, ChevronDown, ChevronRight, Upload, ArrowLeftRight, MoreHorizontal, Package } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useProductsStore } from '../store/useProductsStore';
import { useUiStore } from '../store/useUiStore';
import { filterParentCatalog, findParentByProductOrVariantId } from '../lib/productCatalog';
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
import { createSessionJwt } from '../lib/appwrite';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../components/shared/menu';

function isRealCatalogParent(product, catalogMode) {
  if (catalogMode !== 'parent_variant') return false;
  const id = String(product?.id || '').trim();
  return Boolean(id) && !id.startsWith('legacy-group:');
}

function isLegacyFormatParent(product, catalogMode) {
  if (catalogMode === 'legacy') return true;
  return Boolean(product?._legacy) || String(product?.id || '').startsWith('legacy-group:');
}

async function productsApiPost(body) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new Error('academy_required');

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

const LIFECYCLE_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  sem_estoque: 'Sem estoque',
};

function ProductStatus({ lifecycleKey }) {
  const label = LIFECYCLE_LABELS[lifecycleKey] || lifecycleKey;
  return (
    <span className={`products-status-chip products-status-chip--${lifecycleKey}`}>
      {label}
    </span>
  );
}

function ProductActionsMenu({
  product,
  isOpen,
  onToggle,
  onClose,
  onDuplicate,
  onDelete,
  onManageSizes,
  showManageSizes,
  deleteBusy,
}) {
  const runMenuAction = (e, action) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    onClose();
  };

  const stopMenuEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={(next) => !next && onClose()}>
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
        <DropdownMenuPanel onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onMouseDown={stopMenuEvent}
            onClick={(e) => runMenuAction(e, () => onDuplicate(product))}
          >
            Duplicar produto
          </DropdownMenuItem>
          {showManageSizes ? (
            <DropdownMenuItem
              onMouseDown={stopMenuEvent}
              onClick={(e) => runMenuAction(e, () => onManageSizes(product))}
            >
              {product?._legacy ? 'Adicionar tamanho' : 'Gerenciar tamanhos'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            danger
            disabled={deleteBusy}
            onMouseDown={stopMenuEvent}
            onClick={(e) => runMenuAction(e, () => onDelete(product))}
          >
            Excluir produto
          </DropdownMenuItem>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}

export default function Products() {
  const modules = useLeadStore((s) => s.modules);
  const products = useProductsStore((s) => s.products);
  const catalogMode = useProductsStore((s) => s.catalogMode);
  const loadProducts = useProductsStore((s) => s.loadProducts);
  const createProduct = useProductsStore((s) => s.createProduct);
  const updateProduct = useProductsStore((s) => s.updateProduct);
  const deactivateProduct = useProductsStore((s) => s.deactivateProduct);
  const checkDeleteProduct = useProductsStore((s) => s.checkDeleteProduct);
  const deleteProduct = useProductsStore((s) => s.deleteProduct);
  const loading = useProductsStore((s) => s.loading);
  const error = useProductsStore((s) => s.error);
  const addToast = useUiStore((s) => s.addToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeProduct, setActiveProduct] = useState(null);
  const [catalogProduct, setCatalogProduct] = useState(null);
  const [modalInitialStep, setModalInitialStep] = useState(1);
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
  const [legacyMigrateOpen, setLegacyMigrateOpen] = useState(false);
  const [legacyMigrateTarget, setLegacyMigrateTarget] = useState(null);
  const [legacyMigrateBusy, setLegacyMigrateBusy] = useState(false);

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

  const SortHeader = ({ label, sortKey: key, className }) => (
    <th
      className={`products-table__th${className ? ` ${className}` : ''}`}
      onClick={() => toggleSort(key)}
    >
      <span className="products-table__th-label">
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />
        ) : null}
      </span>
    </th>
  );

  const openCreate = () => {
    setActiveProduct(null);
    setCatalogProduct(null);
    setModalInitialStep(1);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (parent, { step = 1 } = {}) => {
    setCatalogProduct(parent);
    setActiveProduct(parent);
    setModalInitialStep(step);
    setModalMode('edit');
    setModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('edit', parent.id);
      return next;
    });
  };

  const openManageSizes = (parent) => {
    if (isLegacyFormatParent(parent, catalogMode)) {
      setLegacyMigrateTarget(parent);
      setLegacyMigrateOpen(true);
      setActionsMenuId(null);
      return;
    }
    openEdit(parent, { step: 2 });
  };

  const closeLegacyMigrateDialog = () => {
    if (legacyMigrateBusy) return;
    setLegacyMigrateOpen(false);
    setLegacyMigrateTarget(null);
  };

  const confirmLegacyMigrate = async () => {
    const target = legacyMigrateTarget;
    if (!target) return;
    setLegacyMigrateBusy(true);
    try {
      await productsApiPost({ action: 'migrate' });
      const refreshed = await loadProducts();
      const list = refreshed?.length ? refreshed : useProductsStore.getState().products;
      const needleNome = String(target.nome || '').trim().toLowerCase();
      const needleCat = String(target.categoria || '').trim();
      const match =
        list.find(
          (p) =>
            String(p.nome || '').trim().toLowerCase() === needleNome &&
            String(p.categoria || '').trim() === needleCat &&
            isRealCatalogParent(p, 'parent_variant')
        ) ||
        list.find(
          (p) =>
            String(p.nome || '').trim().toLowerCase() === needleNome &&
            isRealCatalogParent(p, 'parent_variant')
        );
      setLegacyMigrateOpen(false);
      setLegacyMigrateTarget(null);
      if (match) {
        openEdit(match, { step: 2 });
        addToast({ type: 'success', message: 'Produto convertido. Gerencie os tamanhos abaixo.' });
      } else {
        addToast({
          type: 'warning',
          message: 'Migração concluída. Localize o produto na lista para gerenciar tamanhos.',
        });
      }
      await refreshStockStores();
    } catch (e) {
      addToast({
        type: 'error',
        message: friendlyError(String(e?.message || e), 'save'),
      });
    } finally {
      setLegacyMigrateBusy(false);
    }
  };

  const openDuplicate = (product) => {
    setActiveProduct(product);
    setCatalogProduct(null);
    setModalInitialStep(1);
    setModalMode('duplicate');
    setModalOpen(true);
    setActionsMenuId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      next.set('duplicate', product.id);
      return next;
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveProduct(null);
    setCatalogProduct(null);
    setModalInitialStep(1);
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
    const parent = findParentByProductOrVariantId(products, id);
    if (!parent) return;
    if (dupId) {
      if (modalOpen && modalMode === 'duplicate' && activeProduct?.id === parent.id) return;
      openDuplicate(parent);
    } else {
      if (modalOpen && modalMode === 'edit' && catalogProduct?.id === parent.id) return;
      const isVariantId = parent.id !== id;
      openEdit(parent, { step: isVariantId ? 2 : 1 });
    }
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
      const deleteCount = (payload.delete_variant_ids || []).length;
      if (errCount > 0) {
        const first = result.errors[0];
        addToast({
          type: 'warning',
          message: `${savedN} variante(s) salva(s), ${errCount} erro(s)${first?.label ? ` em ${first.label}` : ''}`,
          duration: 8000,
        });
      } else if (savedN === 0 && deleteCount > 0) {
        addToast({
          type: 'warning',
          message: 'Nenhuma exclusão foi aplicada. Verifique se o saldo está zerado.',
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
    addToast({
      type: 'success',
      message: isEdit ? 'Produto atualizado' : modalMode === 'duplicate' ? 'Produto duplicado' : 'Produto criado',
    });
    closeModal();
    await refreshStockStores();
    return { ok: true };
  };

  const handleDeactivate = async () => {
    if (!deleteTarget) return;
    const updated = isRealCatalogParent(deleteTarget, catalogMode)
      ? await deactivateProduct(null, { product_id: deleteTarget.id })
      : await deactivateProduct(deleteTarget.variants?.[0]?.id || deleteTarget.id);
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
    try {
      let check;
      if (isRealCatalogParent(product, catalogMode)) {
        const data = await productsApiPost({
          action: 'check_delete_product',
          product_id: product.id,
        });
        check = {
          has_sales: Boolean(data.has_sales),
          can_delete: Boolean(data.can_delete),
          has_stock_moves: Boolean(data.has_stock_moves),
          current_quantity: Number(data.current_quantity) || 0,
        };
      } else {
        const variantId = product.variants?.[0]?.id || product.id;
        check = await checkDeleteProduct(variantId);
      }
      setDeleteBusy(false);
      if (!check) {
        addToast({ type: 'error', message: useProductsStore.getState().error || 'Erro ao verificar produto' });
        setDeleteTarget(null);
        return;
      }
      setDeleteHasSales(check.has_sales || check.has_stock_moves);
      setDeleteDialogOpen(true);
    } catch (err) {
      setDeleteBusy(false);
      addToast({ type: 'error', message: friendlyError(String(err?.message || err), 'load') });
      setDeleteTarget(null);
    }
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
    try {
      if (isRealCatalogParent(deleteTarget, catalogMode)) {
        await productsApiPost({
          action: 'delete_product',
          product_id: deleteTarget.id,
        });
        addToast({
          type: 'success',
          message: `Produto excluído${deleteTarget.variant_count ? ` (${deleteTarget.variant_count} tamanho(s))` : ''}`,
        });
        closeDeleteDialog();
        closeModal();
        await loadProducts();
        await refreshStockStores();
      } else {
        const variantId = deleteTarget.variants?.[0]?.id || deleteTarget.id;
        const result = await deleteProduct(variantId);
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
      }
    } catch (err) {
      const msg = String(err?.message || err);
      if (/vendas registradas|movimenta/i.test(msg)) {
        setDeleteHasSales(true);
      } else {
        addToast({ type: 'error', message: msg || 'Erro ao excluir produto' });
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!canAccess) {
    return null;
  }

  return (
    <div className="container products-page navi-hub-page">
      <div className="loja-subnav loja-subnav--actions-only products-subnav">
        <div className="loja-subnav__actions products-page-actions">
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

      <div className="card mt-4 products-filters-card">
        <div className="filter-bar products-filters-row">
          <div className="form-group filter-field products-filter-group products-filter-group--search">
            <label className="text-xs">Busca</label>
            <div className="products-search-wrap">
              <Search size={14} className="products-search-icon" aria-hidden />
              <input
                className="form-input products-search-input"
                placeholder="Nome, código, categoria…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group filter-field products-filter-group products-filter-group--cat">
            <label className="text-xs">Categoria</label>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group filter-field products-filter-group products-filter-group--status">
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="sem_estoque">Sem estoque</option>
            </select>
          </div>
          <div className="form-group filter-field products-filter-group products-filter-group--type">
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
              className="products-empty"
              icon={Package}
              title="Nenhum produto cadastrado ainda"
              description="Cadastre os produtos da academia para usá-los nas vendas e no controle de estoque."
              primaryAction={{ label: 'Cadastrar primeiro produto', onClick: openCreate }}
              secondaryAction={{ label: 'Importar planilha', onClick: () => setImportOpen(true) }}
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
              <colgroup>
                <col className="products-table__col-thumb" />
                <col className="products-table__col-product" />
                <col className="products-table__col-cat" />
                <col className="products-table__col-price" />
                <col className="products-table__col-qty" />
                <col className="products-table__col-status" />
                <col className="products-table__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="products-table__thumb-head" aria-hidden />
                  <SortHeader label="Produto" sortKey="nome" className="products-table__col-product" />
                  <SortHeader label="Categoria" sortKey="categoria" className="products-table__col-cat" />
                  <SortHeader label="Preço" sortKey="sale_price" className="products-table__col-price" />
                  <SortHeader label="Saldo" sortKey="total_quantity" className="products-table__col-qty" />
                  <SortHeader label="Status" sortKey="lifecycle" className="products-table__col-status" />
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
                          <div className="products-table__thumb-inner">
                            {hasVariants ? (
                              <button
                                type="button"
                                className="products-table__expand-btn"
                                aria-expanded={expanded}
                                aria-label={expanded ? 'Recolher variantes' : 'Expandir variantes'}
                                onClick={() => toggleExpanded(p.id)}
                              >
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : (
                              <span className="products-table__expand-spacer" aria-hidden />
                            )}
                            <ProductThumb imageUrl={p.image_url} alt={p.nome} size={32} />
                          </div>
                        </td>
                        <td className="products-table__col-product">
                          <span
                            className="products-table__name"
                            title={p.supplier ? `Fornecedor: ${p.supplier}` : undefined}
                          >
                            {p.nome}
                            {p.supplier ? (
                              <span className="products-table__supplier text-small text-muted">
                                {' '}
                                · {p.supplier}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="products-table__col-cat text-small text-muted">{p.categoria || '—'}</td>
                        <td className="products-table__col-price text-small products-table__price">
                          {p.sale_price != null ? formatBRL(p.sale_price) : '—'}
                        </td>
                        <td className="products-table__col-qty products-table__qty">
                          {p.total_quantity ?? p.current_quantity ?? 0}
                        </td>
                        <td className="products-table__col-status">
                          <ProductStatus lifecycleKey={lifecycleKey} />
                        </td>
                        <td className="products-table__actions" onClick={(e) => e.stopPropagation()}>
                          <div className="products-table__actions-inner">
                            <ProductActionsMenu
                              product={p}
                              isOpen={actionsMenuId === p.id}
                              onToggle={() => setActionsMenuId((id) => (id === p.id ? null : p.id))}
                              onClose={() => setActionsMenuId(null)}
                              onDuplicate={openDuplicate}
                              onManageSizes={openManageSizes}
                              showManageSizes
                              onDelete={(item) => void openDeleteDialog(item)}
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
                                onClick={() => openManageSizes(p)}
                              >
                                <td className="products-table__thumb-cell" aria-hidden />
                                <td className="products-table__col-product products-table__variant-label">
                                  {[v.size || v.Tamanho, v.color].filter(Boolean).join(' / ') || 'Único'}
                                </td>
                                <td className="products-table__col-cat products-table__cell-empty" aria-hidden />
                                <td className="products-table__col-price products-table__cell-empty" aria-hidden />
                                <td className="products-table__col-qty products-table__qty">{v.current_quantity}</td>
                                <td className="products-table__col-status">
                                  <ProductStatus lifecycleKey={vLife} />
                                </td>
                                <td className="products-table__actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="products-icon-btn products-table__variant-move-btn"
                                    title="Movimentações"
                                    aria-label="Movimentações"
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
              return (
                <article key={p.id} className="navi-mobile-card products-mobile-card">
                  <div className="products-mobile-card__main" onClick={() => openEdit(p)} role="presentation">
                    <ProductThumb imageUrl={p.image_url} alt={p.nome} size={36} />
                    <div className="products-mobile-card__body">
                      <div className="products-mobile-card__title-row">
                        <span className="products-mobile-card__title">{p.nome}</span>
                      </div>
                      <div className="products-mobile-card__meta text-small text-muted">
                        {p.categoria || '—'}
                      </div>
                      <div className="products-mobile-card__row text-small">
                        <span>{p.sale_price != null ? formatBRL(p.sale_price) : '—'}</span>
                        <span className="products-mobile-card__dot" aria-hidden>•</span>
                        <span>Saldo: {p.total_quantity ?? p.current_quantity ?? 0}</span>
                      </div>
                      <ProductStatus lifecycleKey={lifecycleKey} />
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
                      onManageSizes={openManageSizes}
                      showManageSizes
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
        catalogProduct={catalogProduct}
        initialStep={modalInitialStep}
        categories={categories}
        mode={modalMode}
        catalogMode={catalogMode}
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
        onConfirmDeactivate={() => void handleDeactivate()}
      />

      <ConfirmDialog
        open={legacyMigrateOpen}
        title="Converter para novo formato"
        description="Este produto ainda usa o formato antigo. Para gerenciar tamanhos, vamos convertê-lo para o novo formato. Deseja continuar?"
        confirmLabel="Converter e continuar"
        cancelLabel="Cancelar"
        confirmVariant="primary"
        loading={legacyMigrateBusy}
        onClose={closeLegacyMigrateDialog}
        onConfirm={() => void confirmLegacyMigrate()}
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
        <div className="card mt-2 products-import-filter-bar">
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
