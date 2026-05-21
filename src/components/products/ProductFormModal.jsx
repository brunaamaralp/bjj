import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import {
  emptyVariantRow,
  applyDefaultSizePresets,
  normalizeVariantsInput,
  variantRowsFromProduct,
  emptyEditVariantRow,
  findDuplicateVariantIndexes,
  variantLabelForRow,
  normalizeVariantEditRow,
} from '../../lib/productCatalog';
import { centsToNumber, formatBRLFromCents, maskFromNumber, parseMaskToCents } from '../../lib/moneyBr';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const NEW_CAT = '__nova__';

function emptyParentForm() {
  return {
    nome: '',
    categoria: '',
    categoriaSelect: '',
    descricao: '',
    saleMask: '',
    costMask: '',
    type: 'sale',
    is_for_sale: true,
    is_active: true,
    image_url: '',
    unit: 'unidade',
  };
}

function emptyLegacyForm() {
  return {
    ...emptyParentForm(),
    Tamanho: '',
    initial_quantity: '',
    minimum_level: '3',
    notes: '',
  };
}

function parentFormFromProduct(p) {
  return {
    nome: p?.nome || '',
    categoria: p?.categoria || '',
    categoriaSelect: p?.categoria || '',
    descricao: p?.descricao || '',
    saleMask: p?.sale_price != null ? maskFromNumber(p.sale_price) : '',
    costMask: p?.cost_price != null ? maskFromNumber(p.cost_price) : '',
    type: p?.type || (p?.is_for_sale === false ? 'supply' : 'sale'),
    is_for_sale: p?.is_for_sale !== false,
    is_active: p?.is_active !== false,
    image_url: p?.image_url || '',
    unit: p?.unit || 'unidade',
  };
}

function Field({ label, hint, required, children }) {
  return (
    <div className="form-group mt-2">
      <label>{label}{required ? ' *' : ''}</label>
      {hint ? <p className="text-xs text-muted" style={{ margin: '2px 0 4px' }}>{hint}</p> : null}
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="form-group mt-2 flex items-center gap-2" style={{ justifyContent: 'space-between' }}>
      <label style={{ margin: 0 }}>{label}</label>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function ParentFields({ parentForm, setParentForm, categoryOptions }) {
  return (
    <>
      <Field label="Nome" required>
        <input
          className="form-input"
          maxLength={128}
          value={parentForm.nome}
          onChange={(e) => setParentForm((f) => ({ ...f, nome: e.target.value }))}
        />
      </Field>
      <Field label="Categoria" required>
        <select
          className="form-input"
          value={parentForm.categoriaSelect || parentForm.categoria || ''}
          onChange={(e) => {
            const v = e.target.value;
            setParentForm((f) => ({
              ...f,
              categoriaSelect: v,
              categoria: v === NEW_CAT ? f.categoria : v,
            }));
          }}
        >
          <option value="">Selecione…</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value={NEW_CAT}>Nova categoria…</option>
        </select>
        {parentForm.categoriaSelect === NEW_CAT && (
          <input
            className="form-input mt-1"
            placeholder="Nome da categoria"
            maxLength={64}
            value={parentForm.categoria}
            onChange={(e) => setParentForm((f) => ({ ...f, categoria: e.target.value }))}
          />
        )}
      </Field>
      <Field label="Descrição">
        <textarea
          className="form-input"
          rows={2}
          maxLength={512}
          value={parentForm.descricao}
          onChange={(e) => setParentForm((f) => ({ ...f, descricao: e.target.value }))}
        />
      </Field>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <Field label="Preço de venda">
          <input
            className="form-input"
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={parentForm.saleMask}
            onChange={(e) =>
              setParentForm((f) => ({
                ...f,
                saleMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
              }))
            }
          />
        </Field>
        <Field label="Preço de custo">
          <input
            className="form-input"
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={parentForm.costMask}
            onChange={(e) =>
              setParentForm((f) => ({
                ...f,
                costMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
              }))
            }
          />
        </Field>
      </div>
      <Field label="Tipo">
        <select
          className="form-input"
          value={parentForm.type}
          onChange={(e) => {
            const type = e.target.value;
            setParentForm((f) => ({
              ...f,
              type,
              is_for_sale: type !== 'supply',
            }));
          }}
        >
          <option value="sale">Venda</option>
          <option value="supply">Insumo</option>
          <option value="rental">Aluguel</option>
        </select>
      </Field>
      <ToggleRow
        label="É para venda?"
        checked={parentForm.is_for_sale}
        onChange={(v) => setParentForm((f) => ({ ...f, is_for_sale: v }))}
      />
      <Field label="URL da imagem">
        <input
          className="form-input"
          type="url"
          placeholder="https://…"
          value={parentForm.image_url}
          onChange={(e) => setParentForm((f) => ({ ...f, image_url: e.target.value }))}
        />
      </Field>
    </>
  );
}

export default function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  mode,
  loading,
  onSave,
  onDeactivate,
  onRequestDelete,
}) {
  const isEdit = mode === 'edit';
  const isDuplicate = mode === 'duplicate';
  const isCreate = !isEdit && !isDuplicate;
  const isRealParent =
    isEdit && product?.id && !String(product.id).startsWith('legacy-group:');
  const useEditWizard = isRealParent && Array.isArray(product?.variants);
  const useVariantWizard = isCreate;

  const [step, setStep] = useState(1);
  const [parentForm, setParentForm] = useState(emptyParentForm);
  const [legacyForm, setLegacyForm] = useState(emptyLegacyForm);
  const [variants, setVariants] = useState([emptyVariantRow()]);
  const [editVariants, setEditVariants] = useState([emptyEditVariantRow()]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [serverDupIndexes, setServerDupIndexes] = useState([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saveSummary, setSaveSummary] = useState('');

  const duplicateIndexes = useMemo(() => {
    const local = findDuplicateVariantIndexes(editVariants);
    const merged = new Set([...local, ...serverDupIndexes]);
    return merged;
  }, [editVariants, serverDupIndexes]);

  useEffect(() => {
    if (!open) return;
    setServerDupIndexes([]);
    setPendingDeleteIds([]);
    setSaveSummary('');
    setDeleteConfirm(null);

    if (useVariantWizard) {
      setStep(1);
      setParentForm(emptyParentForm());
      setVariants([emptyVariantRow()]);
    } else if (useEditWizard) {
      setStep(1);
      setParentForm(parentFormFromProduct(product));
      setEditVariants(variantRowsFromProduct(product));
    } else {
      setStep(1);
      const lf = {
        ...parentFormFromProduct(product),
        Tamanho: isDuplicate ? '' : product?.Tamanho || '',
        initial_quantity: '',
        minimum_level: String(product?.minimum_level ?? 3),
        notes: product?.notes || '',
      };
      setLegacyForm(lf);
    }
    setDiscardOpen(false);
  }, [open, product, isDuplicate, useVariantWizard, useEditWizard]);

  const requestClose = useCallback(() => {
    if (loading) return;
    setDiscardOpen(true);
  }, [loading]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  const categoryOptions = useMemo(() => {
    const set = new Set(categories || []);
    const cat = useVariantWizard || useEditWizard ? parentForm.categoria : legacyForm.categoria;
    if (cat && !set.has(cat)) set.add(cat);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, parentForm.categoria, legacyForm.categoria, useVariantWizard, useEditWizard]);

  if (!open || typeof document === 'undefined') return null;

  const resolvedCategoria = () =>
    parentForm.categoriaSelect === NEW_CAT
      ? String(parentForm.categoria || '').trim()
      : String(parentForm.categoriaSelect || parentForm.categoria || '').trim();

  const buildParentPayload = () => ({
    product_id: product?.id,
    nome: parentForm.nome.trim(),
    categoria: resolvedCategoria(),
    descricao: parentForm.descricao.trim(),
    sale_price: centsToNumber(parseMaskToCents(parentForm.saleMask)),
    cost_price: centsToNumber(parseMaskToCents(parentForm.costMask)),
    type: parentForm.type,
    is_for_sale: parentForm.is_for_sale,
    is_active: parentForm.is_active,
    image_url: parentForm.image_url.trim(),
    unit: parentForm.unit,
  });

  const goStep2 = async () => {
    if (!parentForm.nome.trim() || !resolvedCategoria()) return;
    setParentForm((f) => ({ ...f, categoria: resolvedCategoria() }));

    if (useEditWizard) {
      const parentRes = await onSave(buildParentPayload(), { isEdit: true, isParent: true, phase: 'parent' });
      if (parentRes?.ok === false) return;
    }
    setStep(2);
  };

  const patchVariantRow = (idx, patch) => {
    setEditVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch, _error: '' } : r)));
    setServerDupIndexes([]);
  };

  const confirmDeleteVariant = (row, idx) => {
    if (row._isNew) {
      setEditVariants((rows) => rows.filter((_, i) => i !== idx));
      return;
    }
    setDeleteConfirm({ row, idx });
  };

  const applyDeleteVariant = () => {
    if (!deleteConfirm) return;
    const { row, idx } = deleteConfirm;
    if (row.id) {
      setPendingDeleteIds((ids) => [...ids, row.id]);
    }
    setEditVariants((rows) => rows.filter((_, i) => i !== idx));
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (useVariantWizard && step === 2) {
      const normalized = normalizeVariantsInput(variants);
      if (!normalized.length) return;
      onSave({ ...buildParentPayload(), variants: normalized }, { isEdit: false, isParent: true });
      return;
    }

    if (useEditWizard && step === 2) {
      const dup = findDuplicateVariantIndexes(editVariants);
      if (dup.size > 0) {
        setServerDupIndexes(dup);
        return;
      }

      const variantPayload = editVariants
        .filter((r) => !r._removed)
        .map((r) => {
          const norm = normalizeVariantEditRow(r);
          return {
            id: r.id || null,
            size: norm.size,
            color: norm.color,
            sku: norm.sku,
            minimum_level: norm.minimum_level,
            initial_quantity: r._isNew ? norm.initial_quantity : undefined,
          };
        });

      const result = await onSave(
        {
          product_id: product.id,
          variants: variantPayload,
          delete_variant_ids: pendingDeleteIds,
          unit: parentForm.unit,
        },
        { isEdit: true, phase: 'variants' }
      );

      if (result?.duplicate_indexes?.length) {
        setServerDupIndexes(new Set(result.duplicate_indexes));
        return;
      }

      if (result?.errors?.length) {
        const nextRows = [...editVariants];
        for (const err of result.errors) {
          const idx = nextRows.findIndex(
            (r) =>
              (err.variant_id && r.id === err.variant_id) ||
              variantLabelForRow(r) === err.label
          );
          if (idx >= 0) {
            nextRows[idx] = { ...nextRows[idx], _error: err.message };
          }
        }
        setEditVariants(nextRows);
        const savedN = result.saved ?? 0;
        const errN = result.errors.length;
        setSaveSummary(
          `${savedN} variante(s) salva(s), ${errN} erro(s)${errN === 1 && result.errors[0]?.label ? ` em ${result.errors[0].label}` : ''}`
        );
      }
      return;
    }

    if (useEditWizard && step === 1) {
      void goStep2();
      return;
    }

    const f = legacyForm;
    const categoria =
      f.categoriaSelect === NEW_CAT ? String(f.categoria || '').trim() : String(f.categoriaSelect || f.categoria || '').trim();
    const payload = {
      nome: f.nome.trim(),
      categoria,
      Tamanho: f.Tamanho.trim(),
      descricao: f.descricao.trim(),
      sale_price: centsToNumber(parseMaskToCents(f.saleMask)),
      cost_price: centsToNumber(parseMaskToCents(f.costMask)),
      is_for_sale: f.is_for_sale,
      is_active: f.is_active,
      minimum_level: Math.max(0, Math.trunc(Number(f.minimum_level) || 0)),
      unit: f.unit,
      image_url: f.image_url.trim(),
      notes: f.notes.trim(),
    };
    if (!isEdit) payload.initial_quantity = Math.max(0, Math.trunc(Number(f.initial_quantity) || 0));
    if (isEdit && product?.id) payload.item_id = product.id;
    onSave(payload, { isEdit });
  };

  const title = isEdit ? 'Editar produto' : isDuplicate ? 'Duplicar produto' : 'Novo produto';
  const wideModal = (useVariantWizard || useEditWizard) && step === 2;

  const renderEditVariantRow = (row, idx) => {
    const isDup = duplicateIndexes.has(idx);
    const canDelete = row._isNew || Number(row.current_quantity) === 0;
    const label = variantLabelForRow(row);

    return (
      <div
        key={row.id || `new-${idx}`}
        className={`product-variants-editor__row${isDup ? ' product-variants-editor__row--error' : ''}`}
      >
        <input
          className="form-input"
          placeholder="Tamanho"
          maxLength={16}
          value={row.size}
          onChange={(e) => patchVariantRow(idx, { size: e.target.value })}
        />
        <input
          className="form-input"
          placeholder="Cor"
          maxLength={32}
          value={row.color}
          onChange={(e) => patchVariantRow(idx, { color: e.target.value })}
        />
        <input
          className="form-input product-variants-editor__readonly"
          readOnly
          disabled
          title="Altere o saldo pela página de Estoque"
          value={row._isNew ? '' : String(row.current_quantity)}
          placeholder={row._isNew ? '—' : '0'}
        />
        <input
          type="number"
          min={0}
          className="form-input"
          placeholder="Mín."
          value={row.minimum_level}
          onChange={(e) => patchVariantRow(idx, { minimum_level: e.target.value })}
        />
        <input
          className="form-input"
          placeholder="SKU"
          maxLength={64}
          value={row.sku}
          onChange={(e) => patchVariantRow(idx, { sku: e.target.value })}
        />
        {row._isNew ? (
          <input
            type="number"
            min={0}
            className="form-input"
            placeholder="Saldo ini."
            title="Saldo inicial (só na criação da variante)"
            value={row.initial_quantity}
            onChange={(e) => patchVariantRow(idx, { initial_quantity: e.target.value })}
          />
        ) : (
          <span className="product-variants-editor__spacer" aria-hidden />
        )}
        <button
          type="button"
          className="btn-ghost"
          aria-label="Excluir variante"
          disabled={!canDelete}
          title={canDelete ? 'Excluir variante' : 'Zere o saldo antes de excluir'}
          onClick={() => confirmDeleteVariant(row, idx)}
        >
          <Trash2 size={16} />
        </button>
        {isDup ? (
          <span className="product-variants-editor__inline-err">Combinação já existe</span>
        ) : row._error ? (
          <span className="product-variants-editor__inline-err">{row._error}</span>
        ) : null}
        {!row._isNew && row.current_quantity > 0 ? (
          <span className="product-variants-editor__hint text-xs text-muted">
            Saldo: altere em Estoque
          </span>
        ) : null}
      </div>
    );
  };

  return createPortal(
    <>
      <div className="navi-modal-overlay" role="presentation" onClick={requestClose}>
        <div
          className="card navi-modal-dialog"
          role="dialog"
          aria-modal="true"
          style={{ maxWidth: wideModal ? 760 : 560, padding: 20 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex justify-between items-center gap-2" style={{ marginBottom: 8 }}>
            <div>
              <h3 className="navi-section-heading" style={{ margin: 0 }}>{title}</h3>
              {(useVariantWizard || useEditWizard) && (
                <p className="text-small text-muted" style={{ margin: '4px 0 0' }}>
                  Passo {step} de 2 — {step === 1 ? 'Dados do produto' : 'Variantes'}
                </p>
              )}
            </div>
            <button type="button" className="btn-action-ghost" onClick={requestClose} disabled={loading} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {((useVariantWizard || useEditWizard) && step === 1) ? (
              <>
                <ParentFields parentForm={parentForm} setParentForm={setParentForm} categoryOptions={categoryOptions} />
                <div className="flex gap-2 justify-end mt-4">
                  <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void goStep2()}
                    disabled={!parentForm.nome.trim() || loading}
                  >
                    Próximo: variantes
                  </button>
                </div>
              </>
            ) : null}

            {useVariantWizard && step === 2 ? (
              <>
                <p className="text-small text-muted" style={{ marginBottom: 8 }}>
                  Produto: <strong>{parentForm.nome}</strong>
                </p>
                <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn-outline" onClick={() => setVariants((rows) => [...rows, emptyVariantRow()])}>
                    <Plus size={14} aria-hidden /> Adicionar variante
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setVariants((rows) => applyDefaultSizePresets(rows))}>
                    Adicionar tamanhos padrão
                  </button>
                </div>
                <div className="product-variants-editor product-variants-editor--create">
                  <div className="product-variants-editor__head text-small text-muted">
                    <span>Tamanho</span>
                    <span>Cor</span>
                    <span>Saldo inicial</span>
                    <span>Mín.</span>
                    <span>SKU</span>
                    <span />
                  </div>
                  {variants.map((row, idx) => (
                    <div key={idx} className="product-variants-editor__row product-variants-editor__row--create">
                      <input className="form-input" value={row.size} onChange={(e) => setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, size: e.target.value } : r)))} />
                      <input className="form-input" value={row.color} onChange={(e) => setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, color: e.target.value } : r)))} />
                      <input type="number" min={0} className="form-input" value={row.initial_quantity} onChange={(e) => setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, initial_quantity: e.target.value } : r)))} />
                      <input type="number" min={0} className="form-input" value={row.minimum_level ?? '0'} onChange={(e) => setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, minimum_level: e.target.value } : r)))} />
                      <input className="form-input" value={row.sku} onChange={(e) => setVariants((rows) => rows.map((r, i) => (i === idx ? { ...r, sku: e.target.value } : r)))} />
                      <button type="button" className="btn-ghost" disabled={variants.length <= 1} onClick={() => setVariants((rows) => rows.filter((_, i) => i !== idx))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={loading}>Voltar</button>
                  <button type="submit" className="btn-secondary" disabled={loading || variants.length === 0}>
                    {loading ? 'Salvando…' : 'Criar produto'}
                  </button>
                </div>
              </>
            ) : null}

            {useEditWizard && step === 2 ? (
              <>
                <p className="text-small text-muted" style={{ marginBottom: 8 }}>
                  <strong>{parentForm.nome}</strong> — edite variantes abaixo. Saldo atual só muda em Estoque.
                </p>
                <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn-outline" onClick={() => setEditVariants((rows) => [...rows, emptyEditVariantRow()])}>
                    <Plus size={14} aria-hidden /> Adicionar variante
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setEditVariants((rows) => applyDefaultSizePresets(rows))}>
                    Adicionar tamanhos padrão
                  </button>
                </div>
                <div className="product-variants-editor product-variants-editor--edit">
                  <div className="product-variants-editor__head text-small text-muted">
                    <span>Tamanho</span>
                    <span>Cor</span>
                    <span title="Altere o saldo pela página de Estoque">Saldo atual</span>
                    <span>Mín. ideal</span>
                    <span>SKU</span>
                    <span>Saldo ini.</span>
                    <span />
                  </div>
                  {editVariants.map((row, idx) => renderEditVariantRow(row, idx))}
                </div>
                {saveSummary ? (
                  <p className="text-small mt-2" style={{ color: 'var(--warning, #c9a227)' }}>{saveSummary}</p>
                ) : null}
                <div className="flex gap-2 justify-end mt-4">
                  <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={loading}>Voltar</button>
                  <button type="submit" className="btn-secondary" disabled={loading || editVariants.length === 0}>
                    {loading ? 'Salvando…' : 'Salvar variantes'}
                  </button>
                </div>
              </>
            ) : null}

            {!useVariantWizard && !useEditWizard ? (
              <>
                <Field label="Nome" required>
                  <input className="form-input" maxLength={128} value={legacyForm.nome} onChange={(e) => setLegacyForm((f) => ({ ...f, nome: e.target.value }))} />
                </Field>
                <Field label="Variação / Tamanho">
                  <input className="form-input" maxLength={16} value={legacyForm.Tamanho} onChange={(e) => setLegacyForm((f) => ({ ...f, Tamanho: e.target.value }))} />
                </Field>
                {!isEdit && (
                  <Field label="Saldo inicial">
                    <input type="number" min={0} className="form-input" value={legacyForm.initial_quantity} onChange={(e) => setLegacyForm((f) => ({ ...f, initial_quantity: e.target.value }))} />
                  </Field>
                )}
                <div className="flex gap-2 justify-end mt-4">
                  <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>Cancelar</button>
                  <button type="submit" className="btn-secondary" disabled={loading}>
                    {loading ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar produto'}
                  </button>
                </div>
              </>
            ) : null}
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={discardOpen}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        confirmVariant="danger"
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title="Excluir esta variante?"
        description="O histórico de estoque será mantido."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onClose={() => setDeleteConfirm(null)}
        onConfirm={applyDeleteVariant}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
          .product-variants-editor__head,
          .product-variants-editor__row--create {
            display: grid;
            grid-template-columns: 1fr 1fr 90px 70px 1fr 36px;
            gap: 8px;
            align-items: center;
          }
          .product-variants-editor--edit .product-variants-editor__row {
            display: grid;
            grid-template-columns: 1fr 1fr 72px 72px 1fr 72px 36px;
            gap: 8px;
            align-items: start;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border, #eee);
          }
          .product-variants-editor__row--error .form-input {
            border-color: var(--danger, #dc2626);
          }
          .product-variants-editor__readonly {
            opacity: 0.65;
            cursor: not-allowed;
            background: var(--surface-muted, #f4f4f5);
          }
          .product-variants-editor__inline-err {
            grid-column: 1 / -1;
            font-size: 12px;
            color: var(--danger, #dc2626);
          }
          .product-variants-editor__hint {
            grid-column: 1 / -1;
          }
          .product-variants-editor__spacer { display: block; }
          .product-variants-editor__head { margin-bottom: 6px; }
        `,
      }} />
    </>,
    document.body
  );
}
