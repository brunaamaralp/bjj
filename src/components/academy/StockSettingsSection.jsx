import React, { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { DEFAULT_STOCK_CHECK_SCHEDULE } from '../../lib/stockInventory';
import {
  mergeStockCheckIntoSettings,
  parseAcademySettings,
  readStockCheckSchedule,
  stockSettingsHasPersistedData,
} from '../../lib/stockSettings';
import EmptyState from '../shared/EmptyState.jsx';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function buildDigest(schedule) {
  return JSON.stringify({
    enabled: schedule.enabled === true,
    dayOfWeek: schedule.dayOfWeek,
    taskTitle: String(schedule.taskTitle || '').trim(),
  });
}

export default function StockSettingsSection({ academyId, modules }) {
  const addToast = useUiStore((s) => s.addToast);
  const [loaded, setLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState({ ...DEFAULT_STOCK_CHECK_SCHEDULE });
  const [savedDigest, setSavedDigest] = useState('');

  useEffect(() => {
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const settings = parseAcademySettings(doc.settings);
        const nextSchedule = readStockCheckSchedule(settings);
        setSchedule(nextSchedule);
        setSavedDigest(buildDigest(nextSchedule));
        setShowOnboarding(!stockSettingsHasPersistedData(doc.settings));
      } catch (e) {
        console.error('[StockSettings]', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const hasUnsaved = useMemo(
    () => loaded && buildDigest(schedule) !== savedDigest,
    [loaded, schedule, savedDigest]
  );

  if (modules?.inventory !== true) return null;

  const save = async () => {
    if (!academyId || !hasUnsaved) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeStockCheckIntoSettings(doc.settings, schedule);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setSavedDigest(buildDigest(schedule));
      setShowOnboarding(false);
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
      <h3 className="navi-section-heading mb-2">Estoque</h3>
      <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
        Conferência periódica de saldo. Compras e vendas no Caixa usam categorias fixas (custo de estoque e
        vendas de produtos).
      </p>

      {loaded && showOnboarding ? (
        <EmptyState
          variant="compact"
          tone="dashed"
          icon={Package}
          className="mb-3"
          title="Configure o estoque da academia"
          description="Defina a conferência semanal de saldo. Lançamentos financeiros de estoque seguem o plano de categorias do sistema."
          primaryAction={{
            label: 'Começar configuração',
            onClick: () => setShowOnboarding(false),
          }}
          role="status"
        />
      ) : null}

      <div className="card">
        <div className="flex justify-between items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <p className="funil-section-subheading" style={{ margin: 0 }}>
            Conferência semanal
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={schedule.enabled}
            aria-label="Ativar conferência semanal de estoque"
            className={`ai-switch${schedule.enabled ? ' ai-switch--on' : ''}`}
            onClick={() => setSchedule((s) => ({ ...s, enabled: !s.enabled }))}
          >
            <span className="ai-switch-thumb" />
          </button>
        </div>

        {schedule.enabled ? (
          <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 20 }}>
            <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
              <label>Dia da semana</label>
              <select
                className="form-input"
                value={schedule.dayOfWeek}
                onChange={(e) => setSchedule((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
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
              <p className="text-xs text-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
                Uma tarefa com este título será criada automaticamente no módulo Tarefas toda semana na data
                configurada.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-small text-muted" style={{ margin: '0 0 20px', lineHeight: 1.45 }}>
            Ative para gerar uma tarefa recorrente de conferência de saldo.
          </p>
        )}

        <div
          className="flex justify-end items-center gap-2 mt-4"
          style={{ flexWrap: 'wrap' }}
        >
          {hasUnsaved ? (
            <span className="funil-unsaved-pill" role="status">
              Alterações não salvas
            </span>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={() => void save()}
            disabled={saving || !hasUnsaved}
          >
            {saving ? 'Salvando…' : 'Salvar estoque'}
          </button>
        </div>
      </div>
    </section>
  );
}
