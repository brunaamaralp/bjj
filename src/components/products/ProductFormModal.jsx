import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import {
  emptyVariantRow,
  duplicateVariantRowsFromProduct,
  normalizeVariantsInput,
  variantRowsFromProduct,
  emptyEditVariantRow,
  findDuplicateVariantIndexes,
  findDuplicateVariantIds,
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

const VARIANT_SIZE_COLOR_READONLY_TITLE =
  'Tamanho e cor não podem ser alterados. Para mudar, remova esta variante e cadastre uma nova.';
const VARIANT_SKU_READONLY_HINT = 'SKU não pode ser alterado após cadastro.';
const VARIANT_DUP_INLINE_MSG = 'Combinação tamanho/cor já existe neste produto.';

function snapshotEditRowInitial(row) {
  return {
    size: row.size,
    color: row.color,
    sku: row.sku,
    minimum_level: row.minimum_level,
    priceOverrideMask: row.priceOverrideMask || '',
    costOverrideMask: row.costOverrideMask || '',
    supplier: String(row.supplier || '').trim(),
    is_active: row.is_active !== false,
  };
}

function VariantRowField({ label, children, className }) {
  return (
    <div className={`product-variants-editor__field${className ? ` ${className}` : ''}`}>
      <label className="product-variants-editor__field-label">{label}</label>
      {children}
    </div>
  );
}

function ProductFormStepper({ step, onStepClick, canGoToStep1 }) {
  const step1Done = step > 1;
  return (
    <nav className="product-form-stepper" aria-label="Progresso do cadastro">
      <button
        type="button"
        className={`product-form-stepper__step${step === 1 ? ' product-form-stepper__step--active' : ''}${step1Done ? ' product-form-stepper__step--done' : ''}`}
        onClick={() => canGoToStep1 && step > 1 && onStepClick(1)}
        disabled={!canGoToStep1 || step === 1}
        aria-current={step === 1 ? 'step' : undefined}
      >
        <span className="product-form-stepper__bullet" aria-hidden>
          {step1Done ? <Check size={12} strokeWidth={3} /> : '1'}
        </span>
        <span className="product-form-stepper__label">Produto</span>
      </button>
      <span className="product-form-stepper__connector" aria-hidden />
      <div
        className={`product-form-stepper__step${step === 2 ? ' product-form-stepper__step--active' : ''}`}
        aria-current={step === 2 ? 'step' : undefined}
      >
        <span className="product-form-stepper__bullet" aria-hidden>2</span>
        <span className="product-form-stepper__label">Tamanhos</span>
      </div>
    </nav>
  );
}

function VariantsSection({ title, hint, children, className }) {
  return (
    <section className={`product-form-variants-section${className ? ` ${className}` : ''}`}>
      <h4 className="product-form-variants-section__title">{title}</h4>
      {hint ? <p className="text-small text-muted product-form-variants-section__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

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

function resolveLegacyEditItemId(product) {
  const id = String(product?.id || '').trim();
  if (!id) return '';
  if (!id.startsWith('legacy-group:')) return id;
  const first = (product?.variants || []).find((v) => v?.id && !String(v.id).startsWith('legacy-group:'));
  return String(first?.id || first?.legacy_stock_item_id || '').trim();
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
  const [partialSaveNotice, setPartialSaveNotice] = useState(false);
  const [expandedVariantIds, setExpandedVariantIds] = useState(() => new Set());
  const initialSnapshotRef = useRef(null);
  const lastAddedRowRef = useRef(null);

  const duplicateIndexes = useMemo(() => {
    const local = findDuplicateVariantIndexes(editVariants);
    const merged = new Set([...local, ...serverDupIndexes]);
    return merged;
  }, [editVariants, serverDupIndexes]);

  const createWizardDuplicateIndexes = useMemo(
    () => findDuplicateVariantIndexes(variants),
    [variants]
  );

  const persistedDuplicateIds = useMemo(
    () => findDuplicateVariantIds(parentRow?.variants),
    [parentRow?.variants]
  );

  useEffect(() => {
    setServerDupIndexes([]);
  }, [editVariants, pendingDeleteIds]);

  /* eslint-disable react-hooks/set-state-in-effect */
  // This effect resets local UI state when opening the modal.
  useEffect(() => {
    if (!open) return;
    setServerDupIndexes([]);
    setPendingDeleteIds([]);
    setSaveSummary('');
    setPartialSaveNotice(false);
    setExpandedVariantIds(new Set());
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

  const categoryOptions = useMemo(() => {
    const set = new Set(categories || []);
    const cat = useVariantWizard || useEditWizard ? parentForm.categoria : legacyForm.categoria;
    if (cat && !set.has(cat)) set.add(cat);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, parentForm.categoria, legacyForm.categoria, useVariantWizard, useEditWizard]);

  const existingEditVariants = useMemo(
    () =>
      editVariants
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => !row._isNew && !row._pendingDelete),
    [editVariants]
  );
  const newEditVariants = useMemo(
    () => editVariants.map((row, idx) => ({ row, idx })).filter(({ row }) => row._isNew),
    [editVariants]
  );
  const canSaveVariants = hasVariantsToSave(editVariants, pendingDeleteIds);

  useEffect(() => {
    if (step !== 2 || !useEditWizard) return;
    setExpandedVariantIds((prev) => {
      const next = new Set(prev);
      for (const row of editVariants) {
        if (row._isNew || !row.id) continue;
        if (row._error || row._dirty || row._savedSuccess) next.add(row.id);
      }
      return next;
    });
  }, [step, useEditWizard, editVariants]);

  const modalTitle = useMemo(() => {
    if ((useVariantWizard || useEditWizard) && step === 2) {
      const nome = String(parentForm.nome || '').trim() || 'Produto';
      return `Tamanhos — ${nome}`;
    }
    if (isEdit) return 'Editar produto';
    if (isDuplicate) return 'Duplicar produto';
    return 'Novo produto';
  }, [useVariantWizard, useEditWizard, step, parentForm.nome, isEdit, isDuplicate]);

  const renderVariantAddActions = ({ onAddRow, addLabel }) => (
    <div className="product-form-variants-actions">
      <button type="button" className="btn-outline" onClick={onAddRow}>
        <Plus size={14} aria-hidden /> {addLabel}
      </button>
    </div>
  );

  const renderVariantsStepFooter = ({
    submitLabel,
    submitDisabled,
    submitTitle,
  }) => (
    <div className="product-form-footer product-form-footer--variants flex gap-2 justify-end" style={footerPadStyle}>
      <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={loading}>
        Voltar
      </button>
      <button
        type="button"
        className="btn-outline"
        onClick={() => {
          setPartialSaveNotice(false);
          onClose();
        }}
        disabled={loading}
      >
        Fechar
      </button>
      <button
        type="submit"
        className="btn-secondary"
        disabled={submitDisabled}
        title={submitTitle}
      >
        {loading ? 'Salvando…' : submitLabel}
      </button>
    </div>
  );

  const renderNewVariantsGrid = ({
    rows,
    rowEntries,
    duplicateIndexSet,
    onPatch,
    onRemove,
    rowKeyPrefix,
  }) => (
    <div className="product-variants-editor product-variants-editor--new-rows">
      {(rowEntries || rows.map((row, idx) => ({ row, idx }))).map(({ row, idx }, mapIdx, arr) => {
        const isLast = mapIdx === arr.length - 1;
        return (
          <div key={`${rowKeyPrefix}-${idx}`} ref={isLast ? lastAddedRowRef : undefined}>
            {renderVariantInputRow({
              row,
              idx,
              isDup: duplicateIndexSet.has(idx),
              hasError: Boolean(row._error),
              onPatch,
              onRemove,
              rowKeyPrefix,
              savedSuccess: Boolean(row._savedSuccess),
            })}
          </div>
        );
      })}
    </div>
  );

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
    setStep(2);
  };

  const toggleVariantCardExpanded = (variantId) => {
    if (!variantId) return;
    setExpandedVariantIds((prev) => {
      if (prev.has(variantId)) {
        const next = new Set(prev);
        next.delete(variantId);
        return next;
      }
      // Um card aberto por vez — evita lista alta e problemas de scroll aninhado.
      return new Set([variantId]);
    });
  };

  const addCreateVariantRow = () => {
    setVariants((rows) => [...rows, emptyVariantRow()]);
    requestAnimationFrame(() => {
      lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const addEditVariantRow = () => {
    setEditVariants((rows) => [...rows, emptyEditVariantRow()]);
    requestAnimationFrame(() => {
      lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const patchVariantRow = (idx, patch) => {
    setEditVariants((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch, _error: '', _savedSuccess: false };
        if (!next._isNew) next._dirty = variantRowIsDirty(next);
        return next;
      })
    );
    setServerDupIndexes([]);
    setPartialSaveNotice(false);
    setSaveSummary('');
  };

  const patchCreateVariantRow = (idx, patch) => {
    setVariants((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
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
    if (row._isNew) {
      setEditVariants((rows) => rows.filter((_, i) => i !== idx));
      setDeleteConfirm(null);
      return;
    }
    if (row.id) {
      setPendingDeleteIds((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]));
      patchVariantRow(idx, { _pendingDelete: true, _error: '' });
    }
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (useVariantWizard && step === 2) {
      const dup = findDuplicateVariantIndexes(variants);
      if (dup.size > 0) return;
      const normalized = normalizeVariantsInput(variants);
      if (!normalized.length) return;
      onSave({ ...buildParentPayload(), variants: normalized }, { isEdit: false, isParent: true });
      return;
    }

    if (useEditWizard && step === 2) {
      const dup = findDuplicateVariantIndexes(editVariants);
      if (dup.size > 0) {
        setServerDupIndexes(dup);
        setSaveSummary('Remova os tamanhos duplicados antes de salvar.');
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
        setSaveSummary('Combinação tamanho/cor duplicada. Ajuste as linhas marcadas.');
        return;
      }

      if (!result?.ok) {
        setSaveSummary(result?.erro || 'Não foi possível salvar as alterações.');
        return;
      }

      if (result?.errors?.length) {
        const errById = new Map();
        const errByLabel = new Map();
        for (const err of result.errors) {
          if (err.variant_id) errById.set(err.variant_id, err.message);
          if (err.label) errByLabel.set(err.label, err.message);
        }

        const payloadLabel = (p) => {
          const size = String(p.size ?? '').trim() || 'Único';
          const color = String(p.color ?? '').trim();
          return color ? `${size} / ${color}` : size;
        };
        const payloadKeys = new Set(
          variantPayload.map((p) => (p.id ? p.id : `new:${payloadLabel(p)}`))
        );

        const failedDeleteIds = new Set(
          result.errors
            .filter((err) => err.variant_id && (err.code === 'has_stock' || err.code === 'delete_failed'))
            .map((err) => err.variant_id)
        );

        const nextRows = editVariants
          .filter((r) => !(r._pendingDelete && r.id && !failedDeleteIds.has(r.id)))
          .map((r) => {
            const label = variantLabelForRow(r);
            const key = r.id ? r.id : `new:${label}`;
            const inPayload =
              payloadKeys.has(key) ||
              variantPayload.some(
                (p) =>
                  (p.id && p.id === r.id) ||
                  (!p.id && r._isNew && payloadLabel(p) === label)
              );

            if (r.id && failedDeleteIds.has(r.id)) {
              return {
                ...r,
                _pendingDelete: false,
                _error: errById.get(r.id) || 'Não foi possível excluir esta variante',
                _savedSuccess: false,
              };
            }

            if (!inPayload) return { ...r, _savedSuccess: false };

            const errMsg =
              (r.id && errById.get(r.id)) || errByLabel.get(label) || null;
            if (errMsg) {
              return { ...r, _error: errMsg, _savedSuccess: false };
            }
            return {
              ...r,
              _error: '',
              _savedSuccess: true,
              _dirty: false,
              _initial: snapshotEditRowInitial(r),
            };
          });
        setEditVariants(nextRows);
        setPendingDeleteIds((ids) => ids.filter((id) => failedDeleteIds.has(id)));
        const savedN = result.saved ?? 0;
        const errN = result.errors.length;
        setPartialSaveNotice(savedN > 0 && errN > 0);
        setSaveSummary(
          savedN > 0 && errN > 0
            ? ''
            : `${savedN} variante(s) salva(s), ${errN} erro(s)${errN === 1 && result.errors[0]?.label ? ` em ${result.errors[0].label}` : ''}`
        );
        return;
      }

      setPendingDeleteIds([]);
      setSaveSummary('');
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
    if (isEdit) {
      const itemId = resolveLegacyEditItemId(product);
      if (itemId) payload.item_id = itemId;
    }
    onSave(payload, { isEdit });
  };

  const wideModal = (useVariantWizard || useEditWizard) && step === 2;
  const showWizardChrome = useVariantWizard || useEditWizard;

  const renderExistingVariantCard = ({ row, idx }) => {
    const isDup = duplicateIndexes.has(idx);
    const hasError = Boolean(row._error);
    const label = variantLabelForRow(row);
    const statusLabel = variantLifecycleLabel(row.lifecycle);
    const canDelete = Number(row.current_quantity) === 0;
    const expanded = row.id ? expandedVariantIds.has(row.id) : true;

    return (
      <article
        key={row.id}
        className={`product-variant-card${isDup || hasError ? ' product-variant-card--error' : ''}${row._savedSuccess ? ' product-variant-card--saved' : ''}${!row.is_active ? ' product-variant-card--inactive' : ''}${expanded ? ' product-variant-card--expanded' : ' product-variant-card--collapsed'}`}
      >
        <button
          type="button"
          className="product-variant-card__identity product-variant-card__identity-toggle"
          onClick={() => toggleVariantCardExpanded(row.id)}
          aria-expanded={expanded}
          title={
            expanded
              ? 'Recolher'
              : `${VARIANT_SIZE_COLOR_READONLY_TITLE} ${VARIANT_SKU_READONLY_HINT}`
          }
        >
          <div className="product-variant-card__identity-main">
            <span className="product-variant-card__identity-label">{label}</span>
            <div className="product-variant-card__identity-meta">
              <span><span className="text-muted">Saldo:</span> {row.current_quantity}</span>
              {row.sku ? (
                <span><span className="text-muted">SKU:</span> {row.sku}</span>
              ) : null}
            </div>
          </div>
          <div className="product-variant-card__identity-badges">
            {row._savedSuccess ? (
              <span className="product-variant-card__saved-badge">Salvo</span>
            ) : null}
            <span className={`product-variant-card__status-chip product-variant-card__status-chip--${row.lifecycle || 'ativo'}`}>
              {statusLabel}
            </span>
            <ChevronDown
              size={18}
              className="product-variant-card__chevron"
              aria-hidden
            />
          </div>
        </button>
        {expanded ? (
        <>
        <p className="product-variant-card__expand-hint text-small text-muted">
          Tamanho, cor e SKU não podem ser alterados. Saldo em Estoque.
        </p>
        <div className="product-variant-card__fields product-variant-card__fields--compact">
          <label className="product-variant-card__field">
            <span className="product-variant-card__field-label">Preço esp.</span>
            <input
              className="form-input"
              inputMode="numeric"
              placeholder="= pai"
              title="Vazio = preço do produto pai"
              value={row.priceOverrideMask}
              onChange={(e) =>
                patchVariantRow(idx, {
                  priceOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
                })
              }
            />
          </label>
          <label className="product-variant-card__field">
            <span className="product-variant-card__field-label">Custo esp.</span>
            <input
              className="form-input"
              inputMode="numeric"
              placeholder="= pai"
              title="Vazio = custo do produto pai"
              value={row.costOverrideMask}
              onChange={(e) =>
                patchVariantRow(idx, {
                  costOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
                })
              }
            />
          </label>
          <label className="product-variant-card__field">
            <span className="product-variant-card__field-label">Mín. ideal</span>
            <input
              type="number"
              min={0}
              className="form-input"
              value={row.minimum_level}
              onChange={(e) => patchVariantRow(idx, { minimum_level: e.target.value })}
            />
          </label>
          <label className="product-variant-card__field product-variant-card__field--wide">
            <span className="product-variant-card__field-label">Fornecedor</span>
            <input
              className="form-input"
              maxLength={120}
              placeholder="Opcional"
              value={row.supplier}
              onChange={(e) => patchVariantRow(idx, { supplier: e.target.value })}
            />
          </label>
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
          <p className="product-variant-card__err">{VARIANT_DUP_INLINE_MSG}</p>
        ) : row._error ? (
          <p className="product-variant-card__err">{row._error}</p>
        ) : null}
        </>
        ) : null}
      </article>
    );
  };

  const renderVariantInputRow = ({
    row,
    idx,
    isDup,
    hasError,
    onPatch,
    onRemove,
    rowKeyPrefix = 'new',
    savedSuccess = false,
  }) => (
    <div
      key={`${rowKeyPrefix}-${idx}`}
      className={`product-variants-editor__row product-variants-editor__row--new new-variant-row${isDup || hasError ? ' product-variants-editor__row--error' : ''}${savedSuccess ? ' product-variants-editor__row--saved' : ''}`}
    >
      {savedSuccess ? (
        <span className="product-variants-editor__saved-badge">Salvo</span>
      ) : null}
      <div className="product-variants-editor__fields">
        <VariantRowField label="Tamanho *">
          <input
            className="form-input"
            aria-label="Tamanho"
            placeholder="Ex.: P, M, G, GG"
            maxLength={16}
            value={row.size}
            onChange={(e) => onPatch(idx, { size: e.target.value })}
          />
        </VariantRowField>
        <VariantRowField label="Cor">
          <input
            className="form-input"
            aria-label="Cor"
            placeholder="Opcional"
            maxLength={32}
            value={row.color}
            onChange={(e) => onPatch(idx, { color: e.target.value })}
          />
        </VariantRowField>
        <VariantRowField label="Saldo inicial">
          <input
            type="number"
            min={0}
            className="form-input"
            aria-label="Saldo inicial"
            placeholder="0"
            value={row.initial_quantity}
            onChange={(e) => onPatch(idx, { initial_quantity: e.target.value })}
          />
        </VariantRowField>
        <VariantRowField label="Estoque mínimo">
          <input
            type="number"
            min={0}
            className="form-input"
            aria-label="Estoque mínimo"
            placeholder="0"
            value={row.minimum_level}
            onChange={(e) => onPatch(idx, { minimum_level: e.target.value })}
          />
        </VariantRowField>
        <VariantRowField label="Preço específico">
          <input
            className="form-input"
            inputMode="numeric"
            aria-label="Preço específico"
            placeholder="Herda do produto"
            title="Vazio = herda o preço do produto pai"
            value={row.priceOverrideMask || ''}
            onChange={(e) =>
              onPatch(idx, {
                priceOverrideMask: formatBRLFromCents(parseMaskToCents(e.target.value)),
              })
            }
          />
        </VariantRowField>
        <VariantRowField label="SKU">
          <input
            className="form-input"
            aria-label="SKU"
            placeholder="Opcional"
            maxLength={64}
            value={row.sku}
            onChange={(e) => onPatch(idx, { sku: e.target.value })}
          />
        </VariantRowField>
      </div>
      <div className="product-variants-editor__row-actions">
        <button
          type="button"
          className="btn-ghost product-variants-editor__remove-btn"
          aria-label="Remover tamanho"
          onClick={() => onRemove(row, idx)}
        >
          <Trash2 size={16} aria-hidden />
          Remover
        </button>
      </div>
      {isDup ? (
        <span className="product-variants-editor__inline-err">{VARIANT_DUP_INLINE_MSG}</span>
      ) : row._error ? (
        <span className="product-variants-editor__inline-err">{row._error}</span>
      ) : null}
    </div>
  );

  return (
    <>
      <ModalShell
        open={open}
        title={modalTitle}
        onClose={requestClose}
        closeOnOverlay={!loading}
        closeOnEsc={!loading}
        showCloseButton={!loading}
        maxWidth={wideModal ? 720 : 420}
        className="navi-modal-overlay--form"
        dialogClassName={`product-form-modal-dialog${wideModal ? ' product-form-modal-dialog--wide' : ''}`}
      >
        {showWizardChrome ? (
          <ProductFormStepper
            step={step}
            canGoToStep1
            onStepClick={(n) => {
              if (n === 1) setStep(1);
            }}
          />
        ) : null}
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
                    disabled={!parentForm.nome.trim() || !resolvedCategoria() || loading}
                  >
                    {useEditWizard ? 'Salvar e ir para tamanhos' : 'Próximo: tamanhos'}
                  </button>
                </div>
              </>
            ) : null}

            {(useVariantWizard || useEditWizard) && step === 2 ? (
              <>
                <div className="product-form-modal__body product-form-modal__body--variants-step">
                {partialSaveNotice ? (
                  <p className="product-form-partial-save-banner" role="status">
                    Alguns tamanhos foram salvos. Veja os itens com erro abaixo.
                  </p>
                ) : null}

                {useEditWizard && persistedDuplicateIds.size > 0 ? (
                  <p className="product-form-partial-save-banner" role="status">
                    Este produto tem tamanhos duplicados no cadastro. Remova as cópias extras
                    (o saldo precisa estar zerado em Estoque) e salve as alterações.
                  </p>
                ) : null}

                {useEditWizard ? (
                  <VariantsSection
                    title="Cadastrados"
                    hint="Lista compacta — toque em um tamanho para editar preços. Role a tela para ver todos."
                  >
                    {existingEditVariants.length > 0 ? (
                      <div className="product-variant-cards">
                        {existingEditVariants.map(renderExistingVariantCard)}
                      </div>
                    ) : (
                      <p className="text-small text-muted product-form-variants-empty">
                        Nenhum tamanho cadastrado ainda.
                      </p>
                    )}
                  </VariantsSection>
                ) : null}

                <VariantsSection
                  title={useEditWizard ? 'Novos tamanhos' : 'Tamanhos'}
                  hint={
                    useEditWizard
                      ? 'Cadastre cada combinação de tamanho e cor. Toque em Adicionar tamanho para incluir mais linhas.'
                      : 'Informe tamanho, saldo inicial e demais dados de cada variante do produto.'
                  }
                  className={useEditWizard ? 'product-form-variants-section--add' : ''}
                >
                  {renderVariantAddActions({
                    addLabel: 'Adicionar tamanho',
                    onAddRow: useEditWizard ? addEditVariantRow : addCreateVariantRow,
                  })}

                  {useVariantWizard ? (
                    renderNewVariantsGrid({
                      rows: variants,
                      duplicateIndexSet: createWizardDuplicateIndexes,
                      onPatch: patchCreateVariantRow,
                      onRemove: (_row, rowIdx) => {
                        if (variants.length <= 1) return;
                        setVariants((rows) => rows.filter((_, i) => i !== rowIdx));
                      },
                      rowKeyPrefix: 'create',
                    })
                  ) : null}

                  {useEditWizard && newEditVariants.length > 0 ? (
                    renderNewVariantsGrid({
                      rowEntries: newEditVariants,
                      duplicateIndexSet: duplicateIndexes,
                      onPatch: patchVariantRow,
                      onRemove: confirmDeleteVariant,
                      rowKeyPrefix: 'new',
                    })
                  ) : useEditWizard ? (
                    <p className="text-small text-muted product-form-variants-empty">
                      Nenhum tamanho novo. Use o botão acima para adicionar.
                    </p>
                  ) : null}
                </VariantsSection>

                {saveSummary ? (
                  <p className="text-small mt-2 product-form-save-summary">{saveSummary}</p>
                ) : null}
                </div>
                {renderVariantsStepFooter({
                  submitLabel: useVariantWizard
                    ? isDuplicate
                      ? 'Duplicar produto'
                      : 'Criar produto'
                    : 'Salvar alterações',
                  submitDisabled: useVariantWizard
                    ? loading || variants.length === 0 || createWizardDuplicateIndexes.size > 0
                    : loading || !canSaveVariants,
                  submitTitle: useVariantWizard && createWizardDuplicateIndexes.size > 0
                    ? 'Corrija as variantes duplicadas antes de salvar.'
                    : undefined,
                })}
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
      </ModalShell>

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
    </>
  );
}
