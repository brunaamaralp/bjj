import React, { useEffect, useMemo, useState } from 'react';
import { PRODUCT_UNIT_OPTIONS } from '../../lib/stockProducts';
import { centsToNumber, formatBRLFromCents, maskFromNumber, parseMaskToCents } from '../../lib/moneyBr';

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
    sku: '',
    image_url: '',
    notes: '',
  };
}

function formFromProduct(p, { isDuplicate }) {
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
    sku: p?.sku || '',
    image_url: p?.image_url || '',
    notes: p?.notes || '',
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
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (!open) return;
    if (product && (isEdit || isDuplicate)) {
      setForm(formFromProduct(product, { isDuplicate }));
    } else {
      setForm(emptyForm());
    }
  }, [open, product, isEdit, isDuplicate]);

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
      sku: form.sku.trim(),
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
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="card modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '100%', margin: '4vh auto', maxHeight: '92vh', overflow: 'auto' }}
      >
        <h3 className="navi-section-heading">{title}</h3>
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

          <Field label="SKU">
            <input className="form-input" maxLength={64} value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
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
            <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn-secondary" disabled={loading}>{loading ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
