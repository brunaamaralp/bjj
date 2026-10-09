import React, { useEffect, useMemo, useState } from 'react';
import FieldError from '../shared/FieldError.jsx';
import { normalizeProfessorCompensation } from '../../../lib/professorCompensation.js';
import { saveProfessorCompensation } from '../../lib/professorCompensationApi.js';

function emptyOverrideRow() {
  return { staff_ref: '', lesson_amount: '', experimental_amount: '' };
}

/**
 * Configuração de remuneração (owner/admin).
 */
export default function ProfessorCompensationConfig({
  academyId,
  compensation: compensationProp,
  staffOptions = [],
  onSaved,
  toast,
}) {
  const [draft, setDraft] = useState(() => normalizeProfessorCompensation(compensationProp));
  const [overrideRows, setOverrideRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const next = normalizeProfessorCompensation(compensationProp);
    setDraft(next);
    const rows = Object.entries(next.overrides || {}).map(([staff_ref, o]) => ({
      staff_ref,
      lesson_amount: o.lesson_amount != null ? String(o.lesson_amount) : '',
      experimental_amount: o.experimental_amount != null ? String(o.experimental_amount) : '',
    }));
    setOverrideRows(rows.length ? rows : []);
  }, [compensationProp]);

  const staffLabelByRef = useMemo(() => {
    const map = new Map();
    for (const o of staffOptions || []) {
      map.set(String(o.id), o.nome || o.id);
    }
    return map;
  }, [staffOptions]);

  const updateRole = (role, field, value) => {
    setDraft((prev) => ({
      ...prev,
      roles: {
        ...prev.roles,
        [role]: {
          ...prev.roles[role],
          [field]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setError('');
    const overrides = {};
    for (const row of overrideRows) {
      const ref = String(row.staff_ref || '').trim();
      if (!ref) continue;
      const lesson = row.lesson_amount === '' ? undefined : Number(row.lesson_amount);
      const exp = row.experimental_amount === '' ? undefined : Number(row.experimental_amount);
      if (lesson != null && (!Number.isFinite(lesson) || lesson < 0)) {
        setError('Override de aula inválido.');
        return;
      }
      if (exp != null && (!Number.isFinite(exp) || exp < 0)) {
        setError('Override de experimental inválido.');
        return;
      }
      overrides[ref] = {
        ...(lesson != null ? { lesson_amount: lesson } : {}),
        ...(exp != null ? { experimental_amount: exp } : {}),
      };
    }

    const payload = normalizeProfessorCompensation({
      product_discount_pct: Number(draft.product_discount_pct),
      roles: {
        professor: {
          lesson_amount: Number(draft.roles?.professor?.lesson_amount) || 0,
          experimental_amount: Number(draft.roles?.professor?.experimental_amount) || 0,
        },
        instructor: {
          lesson_amount: Number(draft.roles?.instructor?.lesson_amount) || 0,
          experimental_amount: Number(draft.roles?.instructor?.experimental_amount) || 0,
        },
      },
      overrides,
    });

    setSaving(true);
    try {
      const saved = await saveProfessorCompensation(payload, academyId);
      toast?.success('Remuneração salva.');
      onSaved?.(saved);
    } catch (e) {
      setError(e?.message || 'Não foi possível salvar');
      toast?.error(e, 'save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="professores-config" aria-label="Configuração de remuneração">
      <div className="flex gap-2 justify-between items-center" style={{ width: '100%' }}>
        <h3 className="professores-config__title">Tabela de remuneração</h3>
        <button type="button" className="btn-outline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar' : 'Editar'}
        </button>
      </div>

      {!open ? (
        <p className="text-small text-muted" style={{ margin: 0 }}>
          Professor aula {draft.roles?.professor?.lesson_amount ?? 0} · experimental{' '}
          {draft.roles?.professor?.experimental_amount ?? 0} · desconto produto{' '}
          {draft.product_discount_pct ?? 30}%
        </p>
      ) : (
        <>
          <div className="professores-config__grid">
            <div className="form-group">
              <label htmlFor="prof-cfg-disc">Desconto produto (%)</label>
              <input
                id="prof-cfg-disc"
                type="number"
                min={0}
                max={100}
                step={1}
                className="form-input"
                value={draft.product_discount_pct}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, product_discount_pct: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-cfg-p-lesson">Professor — R$ / aula</label>
              <input
                id="prof-cfg-p-lesson"
                type="number"
                min={0}
                step={0.01}
                className="form-input"
                value={draft.roles?.professor?.lesson_amount ?? 0}
                onChange={(e) => updateRole('professor', 'lesson_amount', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-cfg-p-exp">Professor — R$ / experimental</label>
              <input
                id="prof-cfg-p-exp"
                type="number"
                min={0}
                step={0.01}
                className="form-input"
                value={draft.roles?.professor?.experimental_amount ?? 0}
                onChange={(e) => updateRole('professor', 'experimental_amount', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-cfg-i-lesson">Instrutor — R$ / aula</label>
              <input
                id="prof-cfg-i-lesson"
                type="number"
                min={0}
                step={0.01}
                className="form-input"
                value={draft.roles?.instructor?.lesson_amount ?? 0}
                onChange={(e) => updateRole('instructor', 'lesson_amount', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-cfg-i-exp">Instrutor — R$ / experimental</label>
              <input
                id="prof-cfg-i-exp"
                type="number"
                min={0}
                step={0.01}
                className="form-input"
                value={draft.roles?.instructor?.experimental_amount ?? 0}
                onChange={(e) => updateRole('instructor', 'experimental_amount', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="professores-config__overrides">
            <div className="flex gap-2 justify-between items-center">
              <strong className="text-small">Overrides por pessoa</strong>
              <button
                type="button"
                className="btn-outline"
                disabled={saving}
                onClick={() => setOverrideRows((rows) => [...rows, emptyOverrideRow()])}
              >
                Adicionar
              </button>
            </div>
            {overrideRows.length === 0 ? (
              <p className="text-small text-muted" style={{ margin: 0 }}>
                Nenhum override. Valores globais do papel serão usados.
              </p>
            ) : (
              overrideRows.map((row, idx) => (
                <div key={`ovr-${idx}`} className="professores-config__override-row">
                  <div className="form-group">
                    <label htmlFor={`prof-ovr-staff-${idx}`}>Pessoa</label>
                    <select
                      id={`prof-ovr-staff-${idx}`}
                      className="form-input"
                      value={row.staff_ref}
                      disabled={saving}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOverrideRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, staff_ref: v } : r))
                        );
                      }}
                    >
                      <option value="">Selecione…</option>
                      {row.staff_ref && !staffLabelByRef.has(row.staff_ref) ? (
                        <option value={row.staff_ref}>{row.staff_ref}</option>
                      ) : null}
                      {(staffOptions || []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor={`prof-ovr-lesson-${idx}`}>R$ aula</label>
                    <input
                      id={`prof-ovr-lesson-${idx}`}
                      type="number"
                      min={0}
                      step={0.01}
                      className="form-input"
                      value={row.lesson_amount}
                      disabled={saving}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOverrideRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, lesson_amount: v } : r))
                        );
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`prof-ovr-exp-${idx}`}>R$ experimental</label>
                    <input
                      id={`prof-ovr-exp-${idx}`}
                      type="number"
                      min={0}
                      step={0.01}
                      className="form-input"
                      value={row.experimental_amount}
                      disabled={saving}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOverrideRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, experimental_amount: v } : r
                          )
                        );
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={saving}
                    onClick={() =>
                      setOverrideRows((rows) => rows.filter((_, i) => i !== idx))
                    }
                  >
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-action-primary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Salvando…' : 'Salvar remuneração'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
