import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  buildAudienceLabel,
  estimateAudienceCount,
  groupPlans,
  sanitizeAudience,
} from '../../lib/automationAudience.js';
import { parseFinanceConfigRaw } from '../../lib/financeConfigStorage.js';
import { useAcademyTurmas } from '../../hooks/useAcademyTurmas.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

const TYPE_OPTIONS = ['Adulto', 'Criança', 'Juniores'];

const TENURE_OPTIONS = [
  { value: '', label: 'Qualquer tempo de casa' },
  { value: 'novato', label: 'Novatos (menos de 60 dias)' },
  { value: 'veterano', label: 'Veteranos (60 dias ou mais)' },
];

function toggleInList(list, value) {
  const arr = Array.isArray(list) ? list : [];
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function PlanCheckboxGroups({ idPrefix, planNames, selected, onChange, disabled, onFieldClose }) {
  const { groups, ungrouped } = useMemo(() => groupPlans(planNames), [planNames]);
  const total = planNames.length;
  const [search, setSearch] = useState('');

  const filteredNames = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return new Set(planNames.filter((n) => n.toLowerCase().includes(q)));
  }, [planNames, search]);

  const renderPlan = (name) => {
    if (filteredNames && !filteredNames.has(name)) return null;
    const id = `${idPrefix}-plan-${name.replace(/\s+/g, '-')}`;
    return (
      <label key={name} className="automacoes-audience-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={selected.includes(name)}
          disabled={disabled}
          onChange={() => onChange(toggleInList(selected, name))}
          onBlur={onFieldClose}
        />
        <span>{name}</span>
      </label>
    );
  };

  return (
    <fieldset className="automacoes-audience-fieldset">
      <legend className="automacoes-audience-legend">Plano</legend>
      {total > 8 ? (
        <input
          type="search"
          className="form-input automacoes-audience-search"
          placeholder="Buscar plano…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          aria-label="Buscar plano"
        />
      ) : null}
      {Object.entries(groups).map(([prefix, names]) => (
        <div key={prefix} className="automacoes-audience-optgroup">
          <span className="automacoes-audience-optgroup-label">{prefix}</span>
          <div className="automacoes-audience-checks">{names.map(renderPlan)}</div>
        </div>
      ))}
      {ungrouped.length > 0 ? (
        <div className="automacoes-audience-optgroup">
          {Object.keys(groups).length > 0 ? (
            <span className="automacoes-audience-optgroup-label">Outros</span>
          ) : null}
          <div className="automacoes-audience-checks">{ungrouped.map(renderPlan)}</div>
        </div>
      ) : null}
    </fieldset>
  );
}

function CheckboxGroup({ idPrefix, legend, options, selected, onChange, disabled, onFieldClose }) {
  return (
    <fieldset className="automacoes-audience-fieldset">
      <legend className="automacoes-audience-legend">{legend}</legend>
      <div className="automacoes-audience-checks">
        {options.map((opt) => {
          const id = `${idPrefix}-${legend}-${opt}`.replace(/\s+/g, '-');
          return (
            <label key={opt} className="automacoes-audience-check" htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={selected.includes(opt)}
                disabled={disabled}
                onChange={() => onChange(toggleInList(selected, opt))}
                onBlur={onFieldClose}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function audienceFilterCount(audience) {
  const cfg = sanitizeAudience(audience);
  return (
    cfg.types.length +
    cfg.plans.length +
    cfg.turmas.length +
    (cfg.tenure ? 1 : 0)
  );
}

function formatStudentCount(count) {
  if (count === 1) return '1 aluno';
  return `${count} alunos`;
}

/**
 * Filtro «Para quem dispara» em gatilhos de cron por aluno.
 *
 * type (Adulto/Criança/Juniores) e turma (ex.: Kids) são campos independentes no aluno —
 * selecionar um não implica o outro (ex.: type=Criança com turma=Kids é válido).
 */
export default function AutomationAudienceSection({
  triggerKey,
  audience: savedAudience,
  academy = {},
  activeStudents = [],
  studentsLoading = false,
  canEdit = false,
  saving = false,
  onSaveAudience,
  onDirtyChange,
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => sanitizeAudience(savedAudience));
  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const planNames = useMemo(() => {
    const cfg = parseFinanceConfigRaw(academy?.financeConfig);
    return (cfg?.plans || [])
      .map((p) => String(p?.name || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [academy?.financeConfig]);

  const academyId = String(academy?.$id || academy?.id || '').trim();
  const { turmas: turmaOptions } = useAcademyTurmas(academyId);

  const savedSanitized = useMemo(() => sanitizeAudience(savedAudience), [savedAudience]);

  const labelText = useMemo(
    () =>
      buildAudienceLabel(
        savedSanitized,
        academy,
        turmaOptions.map((name) => ({ name, is_active: true }))
      ),
    [savedSanitized, academy, turmaOptions]
  );

  const hasActiveFilters = audienceFilterCount(savedSanitized) > 0;

  const savedEstimate = useMemo(
    () => estimateAudienceCount(savedSanitized, activeStudents),
    [savedSanitized, activeStudents]
  );

  const estimate = useMemo(
    () => (expanded ? estimateAudienceCount(draft, activeStudents) : savedEstimate),
    [expanded, draft, activeStudents, savedEstimate]
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateDraft = (patch) => {
    setDraft((prev) => sanitizeAudience({ ...prev, ...patch }));
    setDirty(true);
  };

  const persistAudience = async (audience) => {
    if (!onSaveAudience) return;
    await onSaveAudience(triggerKey, audience);
    setDirty(false);
    setExpanded(false);
  };

  const handleSave = () => {
    const aud = sanitizeAudience(draft);
    const count = estimateAudienceCount(aud, activeStudents);
    if (count === 0) {
      setConfirmZeroOpen(true);
      return;
    }
    void persistAudience(aud);
  };

  const handleToggleExpand = () => {
    if (expanded && dirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!expanded) {
      setDraft(sanitizeAudience(savedAudience));
      setDirty(false);
    }
    setExpanded((v) => !v);
  };

  const discardDraft = () => {
    setDraft(sanitizeAudience(savedAudience));
    setDirty(false);
    setExpanded(false);
    setConfirmDiscardOpen(false);
  };

  const collapsedCountBadge =
    hasActiveFilters && !expanded
      ? formatStudentCount(savedEstimate)
      : null;

  const badgeClass =
    savedEstimate === 0 && hasActiveFilters
      ? 'automacoes-audience-badge automacoes-audience-badge--warn'
      : hasActiveFilters
        ? 'automacoes-audience-badge automacoes-audience-badge--active'
        : '';

  const previewText = studentsLoading
    ? 'Carregando alunos…'
    : estimate === 1
      ? '1 aluno receberá esta mensagem'
      : `${estimate} alunos receberão esta mensagem`;

  return (
    <div className="automacoes-audience" data-trigger={triggerKey}>
      <button
        type="button"
        className="automacoes-audience-toggle"
        onClick={handleToggleExpand}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="automacoes-audience-toggle-label">Para quem dispara</span>
        <span
          className={`automacoes-audience-toggle-value${
            labelText.includes('(removido)') ? ' automacoes-audience-toggle-value--has-removed' : ''
          }`}
        >
          {labelText}
        </span>
        {collapsedCountBadge ? <span className={badgeClass}>{collapsedCountBadge}</span> : null}
      </button>

      {expanded ? (
        <div className="automacoes-audience-panel">
          {dirty ? (
            <StatusBanner variant="warning" className="automacoes-audience-unsaved-banner">
              Alterações na audiência ainda não foram salvas. O gatilho só usa os filtros salvos.
            </StatusBanner>
          ) : null}

          <p className="text-xs text-light automacoes-audience-hint">
            Tipo do aluno e turma são filtros independentes — ex.: Criança na turma Kids.
          </p>

          <CheckboxGroup
            idPrefix={triggerKey}
            legend="Tipo"
            options={TYPE_OPTIONS}
            selected={draft.types}
            onChange={(types) => updateDraft({ types })}
            disabled={!canEdit || saving}
          />

          {planNames.length > 0 ? (
            <PlanCheckboxGroups
              idPrefix={triggerKey}
              planNames={planNames}
              selected={draft.plans}
              onChange={(plans) => updateDraft({ plans })}
              disabled={!canEdit || saving}
            />
          ) : null}

          <CheckboxGroup
            idPrefix={triggerKey}
            legend="Turma"
            options={turmaOptions}
            selected={draft.turmas}
            onChange={(turmas) => updateDraft({ turmas })}
            disabled={!canEdit || saving}
          />

          <div className="automacoes-audience-fieldset">
            <label className="automacoes-audience-legend" htmlFor={`tenure-${triggerKey}`}>
              Tempo de casa
            </label>
            <select
              id={`tenure-${triggerKey}`}
              className="form-input"
              value={draft.tenure || ''}
              disabled={!canEdit || saving}
              onChange={(e) => {
                const v = e.target.value;
                updateDraft({ tenure: v === 'novato' || v === 'veterano' ? v : null });
              }}
            >
              {TENURE_OPTIONS.map((opt) => (
                <option key={opt.value || 'any'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <p
            className={`automacoes-audience-preview${studentsLoading ? ' automacoes-audience-preview--loading' : ''}`}
            role="status"
          >
            {previewText}
          </p>

          {estimate === 0 && dirty && !studentsLoading ? (
            <StatusBanner variant="warning" className="automacoes-audience-zero-banner">
              Nenhum aluno ativo corresponde a esses filtros. Verifique a combinação antes de salvar.
            </StatusBanner>
          ) : null}

          {canEdit ? (
            <div className="automacoes-audience-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !dirty}
                onClick={handleSave}
              >
                {saving ? 'Salvando…' : 'Salvar audiência'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-light" style={{ margin: 0 }}>
              Somente titular ou administrador pode editar a audiência.
            </p>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmZeroOpen}
        title="Audiência vazia"
        description="Nenhum aluno ativo corresponde a esses filtros. Deseja salvar mesmo assim?"
        confirmLabel="Salvar mesmo assim"
        cancelLabel="Revisar filtros"
        confirmVariant="primary"
        onConfirm={() => {
          setConfirmZeroOpen(false);
          void persistAudience(sanitizeAudience(draft));
        }}
        onClose={() => setConfirmZeroOpen(false)}
      />

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Descartar alterações?"
        description="Você alterou os filtros de audiência sem salvar. Fechar descarta essas mudanças."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        confirmVariant="danger"
        onConfirm={discardDraft}
        onClose={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
}
