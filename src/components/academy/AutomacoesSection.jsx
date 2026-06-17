import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import {
    AUTOMATION_DELAY_OPTIONS,
    AUTOMATION_GROUPS,
    AUTOMATION_GROUP_HINTS,
    AUTOMATION_THRESHOLD_OPTIONS,
    templateOptionsForAutomation,
} from '../../lib/useAutomations.js';
import { GATILHOS_SECTION_TO_GROUP_KEY } from '../../lib/automacoesSettingsSections.js';
import { WHATSAPP_TEMPLATE_LABELS } from '../../../lib/whatsappTemplateDefaults.js';
import {
    previewAutomationMessage,
    delayHintForAutomation,
} from '../../lib/automationUx.js';
import AutomacoesReadinessBanner from './AutomacoesReadinessBanner.jsx';
import AutomacoesTabIntroBanner from './AutomacoesTabIntroBanner.jsx';
import AutomacoesZapsterOfflineBanner from './AutomacoesZapsterOfflineBanner.jsx';
import AutomationPreviewLeadPicker from './AutomationPreviewLeadPicker.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

function AutomationRow({
    automationKey,
    meta,
    cfg,
    noTemplatesAvailable,
    templateOptions,
    templatesMap,
    academyName,
    previewLeadData,
    canEdit,
    savingAutomations,
    onToggle,
    onTemplateChange,
    onDelayChange,
    onThresholdChange,
}) {
    const isBirthdayCron = automationKey === 'birthday';
    const isRetentionCron = automationKey === 'absent_student' || automationKey === 'newcomer_at_risk';
    const isDailyCron = isBirthdayCron || isRetentionCron;
    const delayOptions = isDailyCron ? null : AUTOMATION_DELAY_OPTIONS[automationKey];
    const thresholdOptions = isRetentionCron ? AUTOMATION_THRESHOLD_OPTIONS[automationKey] : null;
    const rowTemplateOptions = useMemo(
        () => templateOptionsForAutomation(automationKey, templateOptions),
        [automationKey, templateOptions]
    );
    const hasValidTemplate = isBirthdayCron
        ? Boolean(String(templatesMap?.birthday || '').trim())
        : !noTemplatesAvailable &&
          Boolean(cfg.templateKey) &&
          rowTemplateOptions.some((o) => o.id === cfg.templateKey);
    const switchDisabled = !canEdit || savingAutomations || noTemplatesAvailable || !hasValidTemplate;
    const [previewOpen, setPreviewOpen] = useState(false);

    const scheduleDate =
        String(previewLeadData?.scheduledDate || previewLeadData?.scheduled_date || '').trim() ||
        '2026-06-15';
    const scheduleTime =
        String(previewLeadData?.scheduledTime || previewLeadData?.scheduled_time || '').trim() ||
        '19:00';
    const delayHint = delayHintForAutomation(
        automationKey,
        cfg.delayMinutes,
        scheduleDate,
        scheduleTime
    );
    const previewText = previewOpen
        ? previewAutomationMessage({
              templateKey: cfg.templateKey,
              templatesMap,
              academyName,
              lead: previewLeadData,
          })
        : '';

    return (
        <article
            className={`automacoes-trigger-card${cfg.active ? ' automacoes-trigger-card--on' : ''}`}
            aria-labelledby={`automation-${automationKey}-title`}
        >
            <div className="automacoes-trigger-card__head">
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <strong id={`automation-${automationKey}-title`} className="automacoes-trigger-card__title">
                        {meta.label}
                    </strong>
                    {meta.triggerWhere ? (
                        <span className="automacoes-trigger-card__where">{meta.triggerWhere}</span>
                    ) : null}
                    <p className="text-xs text-light" style={{ marginTop: 6, lineHeight: 1.45, marginBottom: 0 }}>
                        {meta.description}
                    </p>
                    {delayHint ? (
                        <p className="text-xs" style={{ marginTop: 6, color: 'var(--text-secondary)', marginBottom: 0 }}>
                            {delayHint}
                        </p>
                    ) : null}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={cfg.active === true}
                    aria-labelledby={`automation-${automationKey}-title`}
                    aria-disabled={switchDisabled}
                    disabled={switchDisabled}
                    title={
                        !canEdit
                            ? 'Somente titular ou administrador pode alterar'
                            : savingAutomations
                              ? 'Salvando…'
                              : switchDisabled
                                ? noTemplatesAvailable
                                    ? 'Revise os modelos em Modelos de Mensagem'
                                    : 'Selecione um modelo antes de ativar'
                                : undefined
                    }
                    className={`ai-switch${cfg.active ? ' ai-switch--on' : ''}${savingAutomations ? ' ai-switch--loading' : ''}`}
                    onClick={() => {
                        if (switchDisabled) return;
                        onToggle();
                    }}
                >
                    <span className="ai-switch-thumb" />
                </button>
            </div>
            {switchDisabled && canEdit ? (
                <p className="text-xs" style={{ marginTop: 8, color: 'var(--warning)', marginBottom: 0 }}>
                    {noTemplatesAvailable ? (
                        <>
                            Nenhum texto de modelo disponível.{' '}
                            <Link to="/automacoes?tab=modelos" className="edit-link">
                                Abrir Modelos de Mensagem
                            </Link>
                        </>
                    ) : (
                        'Escolha um modelo abaixo para poder ativar.'
                    )}
                </p>
            ) : null}
            <div className="automacoes-trigger-card__controls">
                {isBirthdayCron ? (
                    <div className="automacoes-trigger-card__model-field">
                        <select
                            className="form-input"
                            value="birthday"
                            disabled
                            aria-label={`Modelo para ${meta.label}`}
                            aria-describedby={`automation-${automationKey}-model-hint`}
                        >
                            <option value="birthday">
                                {WHATSAPP_TEMPLATE_LABELS.birthday || 'Aniversário'} (recomendado)
                            </option>
                        </select>
                        <p
                            id={`automation-${automationKey}-model-hint`}
                            className="automacoes-trigger-card__model-hint"
                        >
                            <Link to="/automacoes?tab=modelos" className="edit-link">
                                Editar texto do modelo
                            </Link>
                        </p>
                    </div>
                ) : (
                    <select
                        className="form-input"
                        value={noTemplatesAvailable ? '' : cfg.templateKey || ''}
                        disabled={!canEdit || savingAutomations || noTemplatesAvailable}
                        onChange={(e) => onTemplateChange(e.target.value)}
                        aria-label={`Modelo para ${meta.label}`}
                    >
                        {noTemplatesAvailable ? (
                            <option value="" disabled>
                                Sem modelos — abra Modelos de Mensagem
                            </option>
                        ) : (
                            rowTemplateOptions.map((opt) => (
                                <option key={`${automationKey}-${opt.id}`} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))
                        )}
                    </select>
                )}
                {isBirthdayCron ? (
                    <span className="automacoes-trigger-card__timing">Envio diário (~9h, Brasília)</span>
                ) : isRetentionCron ? (
                    <>
                        <select
                            className="form-input"
                            value={Number(
                                cfg.thresholdDays ??
                                    thresholdOptions?.[0]?.value ??
                                    (automationKey === 'newcomer_at_risk' ? 7 : 10)
                            )}
                            disabled={!canEdit || savingAutomations || noTemplatesAvailable}
                            onChange={(e) => onThresholdChange(Number(e.target.value))}
                            style={{ flex: '0 1 220px' }}
                            aria-label={`Limite de dias: ${meta.label}`}
                        >
                            {(thresholdOptions || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <span className="automacoes-trigger-card__timing">Varredura diária (~9h, Brasília)</span>
                    </>
                ) : delayOptions ? (
                    <select
                        className="form-input"
                        value={Number(cfg.delayMinutes ?? delayOptions[0]?.value ?? 0)}
                        disabled={!canEdit || savingAutomations || noTemplatesAvailable}
                        onChange={(e) => onDelayChange(Number(e.target.value))}
                        style={{ flex: '0 1 200px' }}
                        aria-label={`Quando enviar: ${meta.label}`}
                    >
                        {delayOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="automacoes-trigger-card__timing">Envio imediato</span>
                )}
                {!noTemplatesAvailable && hasValidTemplate ? (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ flex: '0 0 auto', padding: '8px 12px' }}
                        onClick={() => setPreviewOpen((v) => !v)}
                    >
                        {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span style={{ marginLeft: 6 }}>{previewOpen ? 'Ocultar' : 'Ver mensagem'}</span>
                    </button>
                ) : null}
            </div>
            {previewOpen && previewText ? (
                <pre className="automacoes-preview" role="region" aria-label="Prévia da mensagem">
                    {previewText}
                </pre>
            ) : null}
            {previewOpen && !previewText ? (
                <p className="text-xs text-light" style={{ marginTop: 8, marginBottom: 0 }}>
                    Modelo vazio — edite em Modelos de Mensagem.
                </p>
            ) : null}
        </article>
    );
}

const GATILHOS_GROUP_TITLES = {
    captacao: 'Captação',
    posMatricula: 'Pós-matrícula',
    rotinas: 'Rotinas diárias',
};

const AutomacoesSection = ({
    embeddedInLayout = false,
    activeGroupSection = null,
    automationLabels,
    automationsConfig,
    setAutomationsConfig,
    templateOptions,
    templatesMap,
    academyName,
    noTemplatesAvailable,
    readiness,
    canEdit = false,
    savingAutomations = false,
    saveFailed = false,
    onPersistConfig,
    onRetrySave,
    previewLead,
    showTabIntro = false,
}) => {
    const applyConfigChange = (buildNext, { persist = false, successMessage } = {}) => {
        setAutomationsConfig((prev) => {
            const next = buildNext(prev);
            if (persist && canEdit) {
                void onPersistConfig?.(next, { successMessage });
            }
            return next;
        });
    };

    const renderGroup = (title, groupKey, keys, { hideHeading = false } = {}) => (
        <section className="automacoes-group" aria-labelledby={`automacoes-group-${groupKey}`}>
            {!hideHeading ? (
                <>
                    <h4 id={`automacoes-group-${groupKey}`} className="automacoes-group-title">
                        {title}
                    </h4>
                    {AUTOMATION_GROUP_HINTS[groupKey] ? (
                        <p className="automacoes-group-hint">{AUTOMATION_GROUP_HINTS[groupKey]}</p>
                    ) : null}
                </>
            ) : null}
            <div className="automacoes-trigger-list">
                {keys.map((key) => {
                    const meta = automationLabels[key];
                    if (!meta) return null;
                    const cfg = automationsConfig?.[key] || {};
                    return (
                        <AutomationRow
                            key={key}
                            automationKey={key}
                            meta={meta}
                            cfg={cfg}
                            noTemplatesAvailable={noTemplatesAvailable}
                            templateOptions={templateOptions}
                            templatesMap={templatesMap}
                            academyName={academyName}
                            previewLeadData={previewLead?.sampleData}
                            canEdit={canEdit}
                            savingAutomations={savingAutomations}
                            onToggle={() => {
                                const nextActive = !(automationsConfig?.[key]?.active === true);
                                const label = meta?.label || key;
                                applyConfigChange(
                                    (prev) => {
                                        const patch = {
                                            ...(prev?.[key] || {}),
                                            active: nextActive,
                                        };
                                        if (key === 'birthday') {
                                            patch.templateKey = 'birthday';
                                        }
                                        return { ...prev, [key]: patch };
                                    },
                                    {
                                        persist: true,
                                        successMessage: nextActive ? `${label} ativado` : `${label} desativado`,
                                    }
                                );
                            }}
                            onTemplateChange={(templateKey) =>
                                applyConfigChange(
                                    (prev) => ({
                                        ...prev,
                                        [key]: { ...(prev?.[key] || {}), templateKey },
                                    }),
                                    { persist: true }
                                )
                            }
                            onDelayChange={(delayMinutes) =>
                                applyConfigChange(
                                    (prev) => ({
                                        ...prev,
                                        [key]: { ...(prev?.[key] || {}), delayMinutes },
                                    }),
                                    { persist: true }
                                )
                            }
                            onThresholdChange={(thresholdDays) =>
                                applyConfigChange(
                                    (prev) => ({
                                        ...prev,
                                        [key]: { ...(prev?.[key] || {}), thresholdDays },
                                    }),
                                    { persist: true }
                                )
                            }
                        />
                    );
                })}
            </div>
        </section>
    );

    const activeGroupKey = activeGroupSection
        ? GATILHOS_SECTION_TO_GROUP_KEY[activeGroupSection]
        : null;
    const groupsToRender = activeGroupKey
        ? [[GATILHOS_GROUP_TITLES[activeGroupKey], activeGroupKey, AUTOMATION_GROUPS[activeGroupKey]]]
        : [
              ['Captação', 'captacao', AUTOMATION_GROUPS.captacao],
              ['Pós-matrícula', 'posMatricula', AUTOMATION_GROUPS.posMatricula],
              ['Rotinas diárias', 'rotinas', AUTOMATION_GROUPS.rotinas],
          ];

    return (
        <section
            className={`empresa-section animate-in${embeddedInLayout ? ' automacoes-section--embedded' : ''}`}
            style={{ animationDelay: '0.05s' }}
        >
            {showTabIntro ? <AutomacoesTabIntroBanner tabId="gatilhos" /> : null}
            {readiness?.zapsterPartial ? <AutomacoesZapsterOfflineBanner /> : null}
            {!embeddedInLayout ? (
                <h3 className="navi-section-heading" style={{ margin: '0 0 6px' }}>
                    Mensagens automáticas
                </h3>
            ) : null}
            {canEdit ? (
                <p className="navi-eyebrow automacoes-config-save-status" role="status" style={{ marginBottom: 12 }}>
                    {savingAutomations
                        ? 'Salvando…'
                        : saveFailed
                          ? 'Falha ao salvar — use “Tentar novamente” abaixo.'
                          : 'Alterações salvas automaticamente.'}
                </p>
            ) : null}
            {!canEdit ? (
                <p className="text-small text-light" style={{ marginBottom: 12 }}>
                    Modo leitura: apenas titular ou administrador pode ativar gatilhos e alterar modelos
                    vinculados.
                </p>
            ) : null}
            {!showTabIntro ? (
                <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Personalize os textos em{' '}
                    <Link to="/automacoes?tab=modelos" className="edit-link" style={{ fontWeight: 600 }}>
                        Modelos de Mensagem
                    </Link>
                    , depois ative os gatilhos abaixo.
                </p>
            ) : null}
            <AutomacoesReadinessBanner
              readiness={readiness}
              suppressZapsterLink={readiness?.zapsterPartial}
              hideZapsterStep={Boolean(readiness?.zapsterPartial)}
            />
            {previewLead ? (
                <AutomationPreviewLeadPicker
                    className="mb-3"
                    leads={previewLead.leads}
                    sampleLeadId={previewLead.sampleLeadId}
                    onSampleLeadIdChange={previewLead.setSampleLeadId}
                    sampleManual={previewLead.sampleManual}
                    onSampleManualChange={previewLead.setSampleManual}
                    scopeHint
                />
            ) : null}
            {saveFailed ? (
                <StatusBanner
                    variant="warning"
                    className="mb-3"
                    message="Não foi possível salvar a última alteração."
                    onRetry={() => void onRetrySave?.()}
                />
            ) : null}
            {groupsToRender.map(([title, groupKey, keys]) =>
                renderGroup(title, groupKey, keys, { hideHeading: embeddedInLayout })
            )}
        </section>
    );
};

export default AutomacoesSection;
