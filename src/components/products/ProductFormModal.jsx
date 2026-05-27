import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import {
  emptyVariantRow,
  applyDefaultSizePresets,
  duplicateVariantRowsFromProduct,
  normalizeVariantsInput,
  variantRowsFromProduct,
  emptyEditVariantRow,
  findDuplicateVariantIndexes,
  variantLabelForRow,
  variantLifecycleLabel,
  buildVariantsSavePayload,
  hasVariantsToSave,
  variantRowIsDirty,
} from '../../lib/productCatalog';
import { centsToNumber, formatBRLFromCents, maskFromNumber, parseMaskToCents } from '../../lib/moneyBr';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import useVisualViewportKeyboardOffset from '../../hooks/useVisualViewportKeyboardOffset.js';

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
    supplier: '',
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
    supplier: p?.supplier || '',
  };
}

function parentFormFromProductForDuplicate(p) {
  const base = parentFormFromProduct(p);
  const nome = String(base.nome || '').trim();
  if (nome && !/\(cópia\)$/i.test(nome)) {
    base.nome = `${nome} (cópia)`;
  }
  return base;
}

function Field({ label, hint, required, children }) {
  return (
    <div className="form-group mt-2">
      <label>{label}{required ? ' *' : ''}</label>
      {hint ? <p className="text-xs text-muted product-form-field-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="form-group mt-2 flex items-center gap-2 product-form-toggle-row">
      <label>{label}</label>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function ProductBaseFields({ form, setForm, categoryOptions }) {
  return (
    <>
      <Field label="Nome" required>
        <input
          className="form-input"
          maxLength={128}
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
        />
      </Field>
      <Field label="Categoria" required>
        <select
          className="form-input"
          value={form.categoriaSelect || form.categoria || ''}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({
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
        {form.categoriaSelect === NEW_CAT && (
          <input
            className="form-input mt-1"
            placeholder="Nome da categoria"
            maxLength={64}
            value={form.categoria}
            onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
          />
        )}
      </Field>
      <Field label="Fornecedor" hint="Opcional — fabricante ou distribuidor">
        <input
          className="form-input"
          maxLength={120}
          value={form.supplier}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
          placeholder="Ex.: Atama, Vulkan…"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          className="form-input"
          rows={2}
          maxLength={512}
          value={form.descricao}
          onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
        />
      </Field>
      <div className="flex gap-2 product-form-prices-row">
        <Field label="Preço de venda">
          <input
            className="form-input"
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={form.saleMask}
            onChange={(e) =>
              setForm((f) => ({
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
            value={form.costMask}
            onChange={(e) =>
              setForm((f) => ({
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
          value={form.type}
          onChange={(e) => {
            const type = e.target.value;
            setForm((f) => ({
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
        checked={form.is_for_sale}
        onChange={(v) => setForm((f) => ({ ...f, is_for_sale: v }))}
      />
      <Field label="URL da imagem">
        <input
          className="form-input"
          type="url"
          placeholder="https://…"
          value={form.image_url}
          onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
        />
      </Field>
    </>
  );
}

function isCatalogParentRow(row) {
  return Boolean(row?.id) && !String(row.id).startsWith('legacy-group:');
}

export default function ProductFormModal({
  open,
  onClose,
  product,
  catalogProduct = null,
  initialStep = 1,
  categories,
  mode,
  loading,
  catalogMode = 'legacy',
  onSave,
  // Props are accepted for API parity (used in other UIs).
  // eslint-disable-next-line no-unused-vars
  onDeactivate: _onDeactivate,
  // eslint-disable-next-line no-unused-vars
  onRequestDelete: _onRequestDelete,
}) {
  const isEdit = mode === 'edit';
  const isDuplicate = mode === 'duplicate';
  const isCreate = !isEdit && !isDuplicate;
  const parentRow = catalogProduct || product;
  const isRealParent = isEdit && isCatalogParentRow(parentRow);
  const parentVariantCatalog = catalogMode !== 'legacy';
  const useEditWizard =
    parentVariantCatalog && isRealParent && Array.isArray(parentRow?.variants);
  const useVariantWizard = parentVariantCatalog && (isCreate || isDuplicate);

  const [step, setStep] = useState(1);
  const isMobile = useMatchMobile();
  const keyboardOffset = useVisualViewportKeyboardOffset(open && isMobile);
  const footerPadStyle = isMobile ? { paddingBottom: keyboardOffset + 12 } : undefined;
  const [parentForm, setParentForm] = useState(emptyParentForm);
  const [legacyForm, setLegacyForm] = useState(emptyLegacyForm);
  const [variants, setVariants] = useState([emptyVariantRow()]);
  const [editVariants, setEditVariants] = useState([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [serverDupIndexes, setServerDupIndexes] = useState([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [saveSummary, setSaveSummary] = useState('');
  const initialSnapshotRef = useRef(null);

  const duplicateIndexes = useMemo(() => {
    const local = findDuplicateVariantIndexes(editVariants);
    const merged = new Set([...local, ...serverDupIndexes]);
    return merged;
  }, [editVariants, serverDupIndexes]);

  /* eslint-disable react-hooks/set-state-in-effect */
  // This effect resets local UI state when opening the modal.
  useEffect(() => {
    if (!open) return;
    setServerDupIndexes([]);
    setPendingDeleteIds([]);
    setSaveSummary('');
    setDeleteConfirm(null);
    setDeactivateConfirm(null);

    if (useVariantWizard) {
      const initialParent = isDuplicate && product
        ? parentFormFromProductForDuplicate(product)
        : emptyParentForm();
      const initialVariants = isDuplicate && product
        ? duplicateVariantRowsFromProduct(product)
        : [emptyVariantRow()];
      setStep(1);
      setParentForm(initialParent);
      setVariants(initialVariants);
      initialSnapshotRef.current = {
        mode: 'createWizard',
        parentForm: initialParent,
        variants: initialVariants,
      };
    } else if (useEditWizard) {
      const initialParent = parentFormFromProduct(parentRow);
      const initialEditVariants = variantRowsFromProduct(parentRow);
      const startStep = initialStep === 2 ? 2 : 1;
      setStep(startStep);
      setParentForm(initialParent);
      setEditVariants(initialEditVariants);
      initialSnapshotRef.current = {
        mode: 'editWizard',
        parentForm: initialParent,
        editVariants: initialEditVariants,
        pendingDeleteIds: [],
      };
    } else {
      setStep(1);
      const lf = {
        ...(isDuplicate ? parentFormFromProductForDuplicate(product) : parentFormFromProduct(product)),
        Tamanho: isDuplicate ? '' : product?.Tamanho || product?.variants?.[0]?.size || '',
        initial_quantity: '',
        minimum_level: String(product?.minimum_level ?? 3),
        notes: product?.notes || '',
      };
      setLegacyForm(lf);
      initialSnapshotRef.current = { mode: 'legacy', legacyForm: lf };
    }
    setDiscardOpen(false);
  }, [open, product, parentRow, isDuplicate, useVariantWizard, useEditWizard, initialStep]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isFormDirty = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return false;
    if (snap.mode === 'createWizard') {
      return (
        JSON.stringify(parentForm) !== JSON.stringify(snap.parentForm) ||
        JSON.stringify(variants) !== JSON.stringify(snap.variants)
      );
    }
    if (snap.mode === 'editWizard') {
      return (
        JSON.stringify(parentForm) !== JSON.stringify(snap.parentForm) ||
        hasVariantsToSave(editVariants, pendingDeleteIds)
      );
    }
    return JSON.stringify(legacyForm) !== JSON.stringify(snap.legacyForm);
  }, [parentForm, variants, editVariants, pendingDeleteIds, legacyForm]);

  const requestClose = useCallback(() => {
    if (loading) return;
    if (isFormDirty()) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  }, [loading, isFormDirty, onClose]);

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

  const existingEditVariants = useMemo(
    () => editVariants.map((row, idx) => ({ row, idx })).filter(({ row }) => !row._isNew),
    [editVariants]
  );
  const newEditVariants = useMemo(
    () => editVariants.map((row, idx) => ({ row, idx })).filter(({ row }) => row._isNew),
    [editVariants]
  );
  const canSaveVariants = hasVariantsToSave(editVariants, pendingDeleteIds);

  if (!open || typeof document === 'undefined') return null;

  const resolvedCategoria = () =>
    parentForm.categoriaSelect === NEW_CAT
      ? String(parentForm.categoria || '').trim()
      : String(parentForm.categoriaSelect || parentForm.categoria || '').trim();

  const buildParentPayload = () => ({
    product_id: parentRow?.id,
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
    supplier: parentForm.supplier.trim(),
  });

  const goStep2 = async () => {
    if (!parentForm.nome.trim() || !resolvedCategoria()) return;
    setParentForm((f) => ({ ...f, categoria: resolvedCategoria() }));

    if (useEditWizard) {
      const parentRes = await onSave(buildParentPayload(), { isEdit: true, isParent: true, phase: 'parent' });
      if (parentRes?.ok === false) return;
    }
    if (useVariantWizard) {
      setVariants((rows) => applyDefaultSizePresets(rows, { forCreate: true }));
    }
    setStep(2);
  };

  const patchVariantRow = (idx, patch) => {
    setEditVariants((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch, _error: '' };
        if (!next._isNew) next._dirty = variantRowIsDirty(next);
        return next;
      })
    );
    setServerDupIndexes([]);
  };

  const requestVariantActive = (idx, nextActive) => {
    const row = editVariants[idx];
    if (!row) return;
    if (nextActive) {
      patchVariantRow(idx, { is_active: true });
      return;
    }
    if (!row._isNew && Number(row.current_quantity) > 0) {
      setDeactivateConfirm({ idx, row });
      return;
    }
    patchVariantRow(idx, { is_active: false });
  };

  const applyDeactivateVariant = () => {
    if (!deactivateConfirm) return;
    patchVariantRow(deactivateConfirm.idx, { is_active: false });
    setDeactivateConfirm(null);
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

      const variantPayload = buildVariantsSavePayload(editVariants);
      if (!variantPayload.length && !pendingDeleteIds.length) return;

      const result = await onSave(
        {
          product_id: parentRow.id,
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

  const renderExistingVariantCard = ({ row, idx }) => {
    const isDup = duplicateIndexes.has(idx);
    const label = variantLabelForRow(row);
    const statusLabel = variantLifecycleLabel(row.lifecycle);
    const canDelete = Number(row.current_quantity) === 0;

    return (
      <article
        key={row.id}
        className={`product-variant-card${isDup ? ' product-variant-card--error' : ''}${!row.is_active ? ' product-variant-card--inactive' : ''}`}
      >
        <div className="product-variant-card__identity">
          <div className="product-variant-card__identity-main">
            <span className="product-variant-card__identity-label">{label}</span>
            <div className="product-variant-card__identity-meta">
              <span><span className="text-muted">Saldo:</span> {row.current_quantity}</span>
              <span><span className="text-muted">SKU:</span> {row.sku || '—'}</span>
            </div>
          </div>
          <span className={`product-variant-card__status-chip product-variant-card__status-chip--${row.lifecycle || 'ativo'}`}>
            {statusLabel}
          </span>
        </div>
        <div className="product-variant-card__fields">
          <Field label="Preço específico" hint="Vazio = preço do produto pai">
            <input
              className="form-input"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={row.priceOverrideMask}
              onChange={(e) =>
                patchVariantRow(idx, {
                  priceOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
                })
              }
            />
          </Field>
          <Field label="Custo específico" hint="Vazio = custo do produto pai">
            <input
              className="form-input"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={row.costOverrideMask}
              onChange={(e) =>
                patchVariantRow(idx, {
                  costOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
                })
              }
            />
          </Field>
          <Field label="Mín. ideal">
            <input
              type="number"
              min={0}
              className="form-input"
              value={row.minimum_level}
              onChange={(e) => patchVariantRow(idx, { minimum_level: e.target.value })}
            />
          </Field>
          <Field label="Fornecedor" hint="Opcional — sobrescreve o do pai nesta variante">
            <input
              className="form-input"
              maxLength={120}
              value={row.supplier}
              onChange={(e) => patchVariantRow(idx, { supplier: e.target.value })}
            />
          </Field>
        </div>
        <div className="product-variant-card__foot">
          <ToggleRow
            label="Variante ativa"
            checked={row.is_active !== false}
            onChange={(v) => requestVariantActive(idx, v)}
          />
          <button
            type="button"
            className="product-variant-card__remove"
            aria-label="Excluir variante"
            disabled={!canDelete}
            title={canDelete ? 'Excluir variante' : 'Zere o saldo antes de excluir'}
            onClick={() => confirmDeleteVariant(row, idx)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {isDup ? (
          <p className="product-variant-card__err">Combinação já existe nesta lista</p>
        ) : row._error ? (
          <p className="product-variant-card__err">{row._error}</p>
        ) : null}
      </article>
    );
  };

  const renderNewVariantRow = ({ row, idx }) => {
    const isDup = duplicateIndexes.has(idx);
    return (
      <div
        key={`new-${idx}`}
        className={`product-variants-editor__row product-variants-editor__row--new${isDup ? ' product-variants-editor__row--error' : ''}`}
      >
        <input
          className="form-input"
          placeholder="Tamanho *"
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
          className="form-input"
          placeholder="SKU"
          maxLength={64}
          value={row.sku}
          onChange={(e) => patchVariantRow(idx, { sku: e.target.value })}
        />
        <input
          type="number"
          min={0}
          className="form-input"
          placeholder="Estoque ini."
          title="Saldo inicial"
          value={row.initial_quantity}
          onChange={(e) => patchVariantRow(idx, { initial_quantity: e.target.value })}
        />
        <input
          className="form-input"
          inputMode="numeric"
          placeholder="Preço esp."
          title="Preço específico (opcional)"
          value={row.priceOverrideMask}
          onChange={(e) =>
            patchVariantRow(idx, {
              priceOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
            })
          }
        />
        <input
          type="number"
          min={0}
          className="form-input"
          placeholder="Mín."
          value={row.minimum_level}
          onChange={(e) => patchVariantRow(idx, { minimum_level: e.target.value })}
        />
        <button
          type="button"
          className="btn-ghost"
          aria-label="Remover linha"
          onClick={() => confirmDeleteVariant(row, idx)}
        >
          <Trash2 size={16} />
        </button>
        {isDup ? (
          <span className="product-variants-editor__inline-err">Combinação já existe</span>
        ) : row._error ? (
          <span className="product-variants-editor__inline-err">{row._error}</span>
        ) : null}
      </div>
    );
  };

  return createPortal(
    <>
      <div className="navi-modal-overlay" role="presentation" onClick={requestClose}>
        <div
          className={`card navi-modal-dialog product-form-modal-dialog${wideModal ? ' product-form-modal-dialog--wide' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex justify-between items-center gap-2 product-form-modal-header">
            <div>
              <h3 className="navi-section-heading product-form-modal-title">{title}</h3>
              {(useVariantWizard || useEditWizard) && (
                <p className="text-small text-muted product-form-modal-step">
                  Passo {step} de 2 — {step === 1 ? 'Dados do produto' : 'Tamanhos'}
                </p>
              )}
            </div>
            <button type="button" className="btn-action-ghost" onClick={requestClose} disabled={loading} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="product-form-modal-form">
            {((useVariantWizard || useEditWizard) && step === 1) ? (
              <>
                <div className="product-form-modal__body">
                <ProductBaseFields form={parentForm} setForm={setParentForm} categoryOptions={categoryOptions} />
                {useEditWizard ? (
                  <p className="text-small text-muted mt-2" style={{ marginBottom: 0 }}>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ padding: 0, fontSize: 'inherit' }}
                      disabled={loading}
                      onClick={() => void goStep2()}
                    >
                      Gerenciar tamanhos e variantes →
                    </button>
                  </p>
                ) : null}
                </div>
                <div className="product-form-footer flex gap-2 justify-end" style={footerPadStyle}>
                  <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void goStep2()}
                    disabled={!parentForm.nome.trim() || loading}
                  >
                    {useEditWizard ? 'Salvar e ir para tamanhos' : 'Próximo: tamanhos'}
                  </button>
                </div>
              </>
            ) : null}

            {useVariantWizard && step === 2 ? (
              <>
                <div className="product-form-modal__body">
                <p className="text-small text-muted" style={{ marginBottom: 8 }}>
                  Produto: <strong>{parentForm.nome}</strong>
                </p>
                <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn-outline" onClick={() => setVariants((rows) => [...rows, emptyVariantRow()])}>
                    <Plus size={14} aria-hidden /> Adicionar variante
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setVariants((rows) => applyDefaultSizePresets(rows, { forCreate: true }))}>
                    Adicionar tamanhos padrão (P–XGG)
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
                </div>
                <div className="product-form-footer flex gap-2 justify-end" style={footerPadStyle}>
                  <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={loading}>Voltar</button>
                  <button type="submit" className="btn-secondary" disabled={loading || variants.length === 0}>
                    {loading ? 'Salvando…' : isDuplicate ? 'Duplicar produto' : 'Criar produto'}
                  </button>
                </div>
              </>
            ) : null}

            {useEditWizard && step === 2 ? (
              <>
                <div className="product-form-modal__body">
                <h4 className="navi-section-heading" style={{ margin: '0 0 8px', fontSize: '1rem' }}>
                  Tamanhos / Variantes
                </h4>
                <p className="text-small text-muted" style={{ marginBottom: 12 }}>
                  <strong>{parentForm.nome}</strong> — tamanho e cor de variantes já cadastradas não podem ser alterados.
                  O saldo só muda em Estoque.
                </p>

                {existingEditVariants.length > 0 ? (
                  <div className="product-variant-cards">
                    {existingEditVariants.map(renderExistingVariantCard)}
                  </div>
                ) : (
                  <p className="text-small text-muted" style={{ marginBottom: 12 }}>
                    Nenhum tamanho cadastrado ainda.
                  </p>
                )}

                <div className="flex gap-2 mb-2 mt-3" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setEditVariants((rows) => [...rows, emptyEditVariantRow()])}
                  >
                    <Plus size={14} aria-hidden /> Adicionar tamanho
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setEditVariants((rows) => applyDefaultSizePresets(rows))}
                  >
                    Adicionar tamanhos padrão (P–XGG)
                  </button>
                </div>

                {newEditVariants.length > 0 ? (
                  <div className="product-variants-editor product-variants-editor--new-rows">
                    <div className="product-variants-editor__head text-small text-muted">
                      <span>Tamanho</span>
                      <span>Cor</span>
                      <span>SKU</span>
                      <span>Estoque ini.</span>
                      <span>Preço esp.</span>
                      <span>Mín.</span>
                      <span />
                    </div>
                    {newEditVariants.map(renderNewVariantRow)}
                  </div>
                ) : null}

                {saveSummary ? (
                  <p className="text-small mt-2" style={{ color: 'var(--warning, #c9a227)' }}>{saveSummary}</p>
                ) : null}
                </div>
                <div className="product-form-footer flex gap-2 justify-end" style={footerPadStyle}>
                  <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={loading}>
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={loading || !canSaveVariants}
                  >
                    {loading ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              </>
            ) : null}

            {!useVariantWizard && !useEditWizard ? (
              <>
                <div className="product-form-modal__body">
                <ProductBaseFields form={legacyForm} setForm={setLegacyForm} categoryOptions={categoryOptions} />
                <Field label="Variação / Tamanho">
                  <input className="form-input" maxLength={16} value={legacyForm.Tamanho} onChange={(e) => setLegacyForm((f) => ({ ...f, Tamanho: e.target.value }))} />
                </Field>
                {!isEdit && (
                  <Field label="Saldo inicial">
                    <input type="number" min={0} className="form-input" value={legacyForm.initial_quantity} onChange={(e) => setLegacyForm((f) => ({ ...f, initial_quantity: e.target.value }))} />
                  </Field>
                )}
                </div>
                <div className="product-form-footer flex gap-2 justify-end" style={footerPadStyle}>
                  <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>Cancelar</button>
                  <button type="submit" className="btn-secondary" disabled={loading}>
                    {loading ? 'Salvando…' : isDuplicate ? 'Duplicar produto' : isEdit ? 'Salvar' : 'Criar produto'}
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

      <ConfirmDialog
        open={Boolean(deactivateConfirm)}
        title="Desativar este tamanho?"
        description={
          deactivateConfirm
            ? `Esse tamanho tem ${deactivateConfirm.row.current_quantity} unidade(s) em estoque. Deseja continuar?`
            : ''
        }
        confirmLabel="Desativar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onClose={() => setDeactivateConfirm(null)}
        onConfirm={applyDeactivateVariant}
      />
    </>,
    document.body
  );
}
