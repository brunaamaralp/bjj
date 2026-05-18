import React, { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { DEFAULT_STOCK_CHECK_SCHEDULE, DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY } from '../../lib/stockInventory';
import {
  mergeStockCheckIntoSettings,
  parseAcademySettings,
  readStockCheckSchedule,
  readStockPurchaseExpenseCategory,
} from '../../lib/stockSettings';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export default function StockSettingsSection({ academyId, modules }) {
  const addToast = useUiStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState({ ...DEFAULT_STOCK_CHECK_SCHEDULE });
  const [expenseCategory, setExpenseCategory] = useState(DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const settings = parseAcademySettings(doc.settings);
        setSchedule(readStockCheckSchedule(settings));
        setExpenseCategory(readStockPurchaseExpenseCategory(settings));
      } catch (e) {
        console.error('[StockSettings]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (modules?.inventory !== true) return null;

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeStockCheckIntoSettings(doc.settings, schedule, expenseCategory);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      addToast({ type: 'success', message: 'Configurações de estoque salvas.' });
    } catch (e) {
      console.error('[StockSettings] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 8 }}>
      <div className="card">
        <h3 className="navi-section-heading">Estoque</h3>
        <p className="text-small text-muted" style={{ marginTop: 6, marginBottom: 16 }}>
          Conferência periódica e categoria padrão de despesas ao registrar compras com valor.
        </p>

        <div className="card" style={{ padding: 12, border: '1px solid var(--border-light)', marginBottom: 16 }}>
          <div className="flex justify-between items-center gap-2 mb-2">
            <strong>Conferência semanal</strong>
            <button
              type="button"
              role="switch"
              aria-checked={schedule.enabled}
              className={`ai-switch${schedule.enabled ? ' ai-switch--on' : ''}`}
              onClick={() => setSchedule((s) => ({ ...s, enabled: !s.enabled }))}
            >
              <span className="ai-switch-thumb" />
            </button>
          </div>
          {schedule.enabled && (
            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
                <label>Dia da semana</label>
                <select
                  className="form-input"
                  value={schedule.dayOfWeek}
                  onChange={(e) => setSchedule((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: '2 1 220px', margin: 0 }}>
                <label>Título da tarefa</label>
                <input
                  className="form-input"
                  value={schedule.taskTitle}
                  onChange={(e) => setSchedule((s) => ({ ...s, taskTitle: e.target.value }))}
                  placeholder={DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle}
                />
              </div>
            </div>
          )}
        </div>

        {modules?.finance === true && (
          <div className="form-group">
            <label>Categoria no Caixa (compras de estoque)</label>
            <input
              className="form-input"
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              placeholder={DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY}
            />
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Usada na descrição do lançamento quando uma entrada informa valor pago.
            </p>
          </div>
        )}

        <div className="flex justify-end mt-3">
          <button type="button" className="btn-secondary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar estoque'}
          </button>
        </div>
      </div>
    </section>
  );
}
