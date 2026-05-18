import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  PRODUCT_UNIT_OPTIONS,
  PRODUCT_SKU_PRESETS,
  PRODUCT_SKU_OTHER,
  parseSkuFormFields,
  resolveSkuFromForm,
} from '../../lib/stockProducts';
import { centsToNumber, formatBRLFromCents, maskFromNumber, parseMaskToCents } from '../../lib/moneyBr';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const NEW_CAT = '__nova__';

function emptyForm() {
  return {
    nome: '',
    categoria: '',
    categoriaSelect: '',
    Tamanho: '',
    descricao: '',
    saleMask: '',
    costMask: '',
    is_for_sale: true,
    is_active: true,
    initial_quantity: '',
    minimum_level: '3',
    unit: 'unidade',
    skuSelect: '',
    skuOther: '',
    image_url: '',
    notes: '',
  };
}

function formFromProduct(p, { isDuplicate }) {
  const skuFields = isDuplicate ? { skuSelect: '', skuOther: '' } : parseSkuFormFields(p?.sku);
  return {
    nome: p?.nome || '',
    categoria: p?.categoria || '',
    categoriaSelect: p?.categoria || '',
    Tamanho: isDuplicate ? '' : p?.Tamanho || '',
    descricao: p?.descricao || '',
    saleMask: p?.sale_price != null ? maskFromNumber(p.sale_price) : '',
    costMask: p?.cost_price != null ? maskFromNumber(p.cost_price) : '',
    is_for_sale: p?.is_for_sale !== false,
    is_active: p?.is_active !== false,
    initial_quantity: '',
    minimum_level: String(p?.minimum_level ?? 3),
    unit: p?.unit || 'unidade',
    ...skuFields,
    image_url: p?.image_url || '',
    notes: p?.notes || '',
  };
}

function formsEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
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

export default function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  mode,
  loading,
  onSave,
  onDeactivate,
}) {
  const isEdit = mode === 'edit';
  const isDuplicate = mode === 'duplicate';
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next =
      product && (isEdit || isDuplicate) ? formFromProduct(product, { isDuplicate }) : emptyForm();
    setForm(next);
    setInitialForm(next);
    setDiscardOpen(false);
  }, [open, product, isEdit, isDuplicate]);

  const isDirty = useMemo(() => !formsEqual(form, initialForm), [form, initialForm]);

  const requestClose = useCallback(() => {
    if (loading) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }, [isDirty, loading, onClose]);

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
    if (form.categoria && !set.has(form.categoria)) set.add(form.categoria);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, form.categoria]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const categoria =
      form.categoriaSelect === NEW_CAT
        ? String(form.categoria || '').trim()
        : String(form.categoriaSelect || form.categoria || '').trim();

    const payload = {
      nome: form.nome.trim(),
      categoria,
      Tamanho: form.Tamanho.trim(),
      descricao: form.descricao.trim(),
      sale_price: centsToNumber(parseMaskToCents(form.saleMask)),
      cost_price: centsToNumber(parseMaskToCents(form.costMask)),
      is_for_sale: form.is_for_sale,
      is_active: form.is_active,
      minimum_level: Math.max(0, Math.trunc(Number(form.minimum_level) || 0)),
      unit: form.unit,
      sku: resolveSkuFromForm(form.skuSelect, form.skuOther),
      image_url: form.image_url.trim(),
      notes: form.notes.trim(),
    };

    if (!isEdit) {
      payload.initial_quantity = Math.max(0, Math.trunc(Number(form.initial_quantity) || 0));
    }

    if (isEdit && product?.id) {
      payload.item_id = product.id;
    }

    onSave(payload, { isEdit });
  };

  const title = isEdit ? 'Editar produto' : isDuplicate ? 'Duplicar produto' : 'Novo produto';

  return (
    <>
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div
          className="card modal-panel"
          style={{ maxWidth: 560, width: '100%', margin: '4vh auto', maxHeight: '92vh', overflow: 'auto' }}
        >
          <div className="flex justify-between items-center gap-2" style={{ marginBottom: 8 }}>
            <h3 className="navi-section-heading" style={{ margin: 0 }}>{title}</h3>
            <button
              type="button"
              className="btn-action-ghost"
              onClick={requestClose}
              disabled={loading}
              aria-label="Fechar"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <Field label="Nome" required>
              <input className="form-input" maxLength={128} value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
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

            <ToggleRow label="É para venda?" checked={form.is_for_sale} onChange={(v) => setForm((f) => ({ ...f, is_for_sale: v }))} />

            <Field label="Variação / Tamanho">
              <input className="form-input" maxLength={16} placeholder="A1, P, M, Único…" value={form.Tamanho} onChange={(e) => setForm((f) => ({ ...f, Tamanho: e.target.value }))} />
            </Field>

            <Field label="Descrição">
              <textarea className="form-input" rows={2} maxLength={512} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </Field>

            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <Field label="Preço de venda">
                <input
                  className="form-input"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={form.saleMask}
                  onChange={(e) => setForm((f) => ({ ...f, saleMask: formatBRLFromCents(parseMaskToCents(e.target.value)) }))}
                />
              </Field>
              <Field label="Preço de custo">
                <input
                  className="form-input"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={form.costMask}
                  onChange={(e) => setForm((f) => ({ ...f, costMask: formatBRLFromCents(parseMaskToCents(e.target.value)) }))}
                />
              </Field>
            </div>

            {!isEdit && (
              <Field label="Saldo inicial" hint="Gera entrada automática se maior que zero">
                <input
                  type="number"
                  min={0}
                  className="form-input"
                  value={form.initial_quantity}
                  onChange={(e) => setForm((f) => ({ ...f, initial_quantity: e.target.value }))}
                />
              </Field>
            )}

            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <Field label="Nível mínimo">
                <input type="number" min={0} className="form-input" value={form.minimum_level} onChange={(e) => setForm((f) => ({ ...f, minimum_level: e.target.value }))} />
              </Field>
              <Field label="Unidade">
                <select className="form-input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                  {PRODUCT_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Código / Referência">
              <select
                className="form-input"
                value={form.skuSelect}
                onChange={(e) => setForm((f) => ({ ...f, skuSelect: e.target.value }))}
              >
                <option value="">Selecionar…</option>
                {PRODUCT_SKU_PRESETS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
                <option value={PRODUCT_SKU_OTHER}>Outro (digitar)</option>
              </select>
              {form.skuSelect === PRODUCT_SKU_OTHER ? (
                <input
                  className="form-input mt-1"
                  maxLength={64}
                  placeholder="Ex: A5, XL, 42…"
                  value={form.skuOther}
                  onChange={(e) => setForm((f) => ({ ...f, skuOther: e.target.value }))}
                />
              ) : null}
            </Field>

            <Field label="URL da imagem">
              <input className="form-input" type="url" placeholder="https://…" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} />
            </Field>

            <ToggleRow label="Ativo" checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />

            <div className="flex gap-2 justify-end mt-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              {isEdit && product?.is_active && onDeactivate ? (
                <button type="button" className="btn-outline" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => onDeactivate(product.id)} disabled={loading}>
                  Desativar produto
                </button>
              ) : (
                <span style={{ marginRight: 'auto' }} />
              )}
              <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="btn-secondary" disabled={loading}>
                {loading ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar produto'}
              </button>
            </div>
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
    </>
  );
}
