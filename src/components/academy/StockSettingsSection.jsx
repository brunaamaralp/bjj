import '../../styles/stock-settings.css';
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { DEFAULT_STOCK_CHECK_SCHEDULE } from '../../lib/stockInventory';
import {
  mergeStockCheckIntoSettings,
  parseAcademySettings,
  readStockCheckSchedule,
} from '../../lib/stockSettings';
import Hint from '../shared/Hint.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function weekdayLabel(dayOfWeek) {
  return WEEKDAYS.find((d) => d.value === dayOfWeek)?.label || '—';
}

function buildDigest(schedule) {
  return JSON.stringify({
    enabled: schedule.enabled === true,
    dayOfWeek: schedule.dayOfWeek,
    taskTitle: String(schedule.taskTitle || '').trim(),
  });
}

/**
 * @param {{ academyId: string, modules?: { inventory?: boolean, finance?: boolean }, onClose?: () => void }} props
 */
export default function StockSettingsSection({ academyId, modules, onClose }) {
  const addToast = useUiStore((s) => s.addToast);
  const [loaded, setLoaded] = useState(false);
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

  const taskTitleTrimmed = useMemo(
    () => String(schedule.taskTitle || '').trim() || DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle,
    [schedule.taskTitle]
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
      addToast({ type: 'success', message: 'Configurações de estoque salvas.' });
    } catch (e) {
      console.error('[StockSettings] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="stock-settings animate-in" aria-labelledby="stock-settings-title">
      <div className="stock-settings__panel card">
        <header className="stock-settings__panel-head">
          <div className="stock-settings__panel-head-text">
            <h2 id="stock-settings-title" className="navi-section-heading">
              Configurações de estoque
            </h2>
            <p className="navi-subtitle">
              Defina o lembrete semanal para conferir saldos. O inventário em si continua na aba Inventário.
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              className="stock-settings__close"
              onClick={onClose}
              aria-label="Fechar configurações"
            >
              <X size={18} aria-hidden />
            </button>
          ) : null}
        </header>

        {!loaded ? (
          <p className="stock-settings__loading" role="status">
            Carregando configurações…
          </p>
        ) : (
          <>
            <div className="stock-settings__block">
              <div className="stock-settings__block-head">
                <h3 className="stock-settings__block-title">Lembrete de conferência</h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={
                    schedule.enabled
                      ? 'Desativar lembrete semanal de conferência'
                      : 'Ativar lembrete semanal de conferência'
                  }
                  className={`ai-switch${schedule.enabled ? ' ai-switch--on' : ''}`}
                  onClick={() => setSchedule((s) => ({ ...s, enabled: !s.enabled }))}
                >
                  <span className="ai-switch-thumb" />
                </button>
              </div>

              {schedule.enabled ? (
                <>
                  <div className="stock-settings__fields">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="stock-check-day">Dia da semana</label>
                      <select
                        id="stock-check-day"
                        className="form-input"
                        value={schedule.dayOfWeek}
                        onChange={(e) =>
                          setSchedule((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))
                        }
                      >
                        {WEEKDAYS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <span className="stock-settings__label-row">
                        <label htmlFor="stock-check-task-title">Título da tarefa</label>
                        <Hint
                          text="Uma tarefa com este título será criada automaticamente no módulo Tarefas toda semana no dia escolhido."
                          position="top"
                        />
                      </span>
                      <input
                        id="stock-check-task-title"
                        className="form-input"
                        value={schedule.taskTitle}
                        onChange={(e) => setSchedule((s) => ({ ...s, taskTitle: e.target.value }))}
                        placeholder={DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle}
                      />
                    </div>
                  </div>
                  <p className="stock-settings__preview" role="status">
                    Toda <strong>{weekdayLabel(schedule.dayOfWeek)}</strong>, será criada a tarefa{' '}
                    <strong>{taskTitleTrimmed}</strong> em Tarefas.
                  </p>
                </>
              ) : (
                <p className="stock-settings__idle">
                  Com o lembrete desativado, nenhuma tarefa automática de conferência será gerada. Você
                  ainda pode conferir itens manualmente pelo inventário.
                </p>
              )}
            </div>

            {modules?.finance === true ? (
              <StatusBanner
                variant="info"
                className="stock-settings__caixa-note"
                message="No Caixa, compras de estoque e vendas de produtos usam categorias fixas do plano (custo de estoque e vendas de produtos)."
              />
            ) : null}

            <footer className="stock-settings__footer">
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
                {saving ? 'Salvando…' : 'Salvar configurações'}
              </button>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
