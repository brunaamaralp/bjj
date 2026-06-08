import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import {
    AUTOMATION_DELAY_OPTIONS,
    AUTOMATION_GROUPS,
    serializeAutomationsConfig,
} from '../../lib/useAutomations.js';
import {
    previewAutomationMessage,
    delayHintForAutomation,
    computeAutomationReadiness,
} from '../../lib/automationUx.js';
import AutomacoesReadinessBanner from './AutomacoesReadinessBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

function AutomationRow({
    automationKey,
    meta,
    cfg,
    noTemplatesAvailable,
    templateOptions,
    templatesMap,
    academyName,
    onToggle,
    onTemplateChange,
    onDelayChange,
    isLast,
}) {
    const delayOptions = AUTOMATION_DELAY_OPTIONS[automationKey];
    const hasValidTemplate =
        !noTemplatesAvailable &&
        Boolean(cfg.templateKey) &&
        templateOptions.some((o) => o.id === cfg.templateKey);
    const switchDisabled = noTemplatesAvailable || !hasValidTemplate;
    const [previewOpen, setPreviewOpen] = useState(false);

    const delayHint = delayHintForAutomation(
        automationKey,
        cfg.delayMinutes,
        '2026-06-15',
        '19:00'
    );
    const previewText = previewOpen
        ? previewAutomationMessage({
              templateKey: cfg.templateKey,
              templatesMap,
              academyName,
          })
        : '';

    return (
        <div
            className="automacoes-row"
            style={{
                padding: '14px 0',
                borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
            }}
        >
            <div className="flex justify-between items-start gap-3" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.95rem' }}>{meta.label}</strong>
                    <p className="text-xs text-light" style={{ marginTop: 4, lineHeight: 1.45 }}>
                        {meta.description}
                    </p>
                    {delayHint ? (
                        <p className="text-xs" style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                            {delayHint}
                        </p>
                    ) : null}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={cfg.active === true}
                    aria-disabled={switchDisabled}
                    disabled={switchDisabled}
                    title={
                        switchDisabled
                            ? noTemplatesAvailable
                                ? 'Revise os modelos em Modelos de Mensagem'
                                : 'Selecione um template antes de ativar'
                            : undefined
                    }
                    className={`ai-switch${cfg.active ? ' ai-switch--on' : ''}`}
                    onClick={() => {
                        if (switchDisabled) return;
                        onToggle();
                    }}
                >
                    <span className="ai-switch-thumb" />
                </button>
            </div>
            {switchDisabled ? (
                <p className="text-xs" style={{ marginTop: 8, color: 'var(--warning)' }}>
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
            <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    className="form-input"
                    value={noTemplatesAvailable ? '' : cfg.templateKey || ''}
                    disabled={noTemplatesAvailable}
                    onChange={(e) => onTemplateChange(e.target.value)}
                    style={{ flex: '1 1 220px' }}
                    aria-label={`Modelo para ${meta.label}`}
                >
                    {noTemplatesAvailable ? (
                        <option value="" disabled>
                            Sem modelos — abra Modelos de Mensagem
                        </option>
                    ) : (
                        templateOptions.map((opt) => (
                            <option key={`${automationKey}-${opt.id}`} value={opt.id}>
                                {opt.label}
                            </option>
                        ))
                    )}
                </select>
                {delayOptions ? (
                    <select
                        className="form-input"
                        value={Number(cfg.delayMinutes ?? delayOptions[0]?.value ?? 0)}
                        disabled={noTemplatesAvailable}
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
                    <span className="text-xs text-light" style={{ flex: '0 1 120px' }}>
                        Envio imediato
                    </span>
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
                <p className="text-xs text-light" style={{ marginTop: 8 }}>
                    Modelo vazio — edite em Modelos de Mensagem.
                </p>
            ) : null}
        </div>
    );
}

const AutomacoesSection = ({
    automationLabels,
    automationsConfig,
    setAutomationsConfig,
    templateOptions,
    templatesMap,
    academyName,
    noTemplatesAvailable,
    automationsConfigRaw,
    readiness,
    academyDataVersion = 0,
    savingAutomations,
    onSave,
}) => {
    const [savedDigest, setSavedDigest] = useState(() =>
        serializeAutomationsConfig(automationsConfigRaw)
    );

    useEffect(() => {
        setSavedDigest(serializeAutomationsConfig(automationsConfigRaw));
    }, [automationsConfigRaw, academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasUnsavedChanges = useMemo(
        () => serializeAutomationsConfig(automationsConfig) !== savedDigest,
        [automationsConfig, savedDigest]
    );

    const handleSave = async () => {
        await onSave();
        setSavedDigest(serializeAutomationsConfig(automationsConfig));
    };

    const renderGroup = (title, keys) => (
        <>
            <p className="funil-section-subheading" style={{ marginTop: title === 'Captação' ? 16 : 24 }}>
                {title}
            </p>
            {keys.map((key, index) => {
                const meta = automationLabels[key];
                if (!meta) return null;
                const cfg = automationsConfig?.[key] || {};
                const isLast = index === keys.length - 1;
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
                        isLast={isLast}
                        onToggle={() =>
                            setAutomationsConfig((prev) => ({
                                ...prev,
                                [key]: {
                                    ...(prev?.[key] || {}),
                                    active: !(prev?.[key]?.active === true),
                                },
                            }))
                        }
                        onTemplateChange={(templateKey) =>
                            setAutomationsConfig((prev) => ({
                                ...prev,
                                [key]: { ...(prev?.[key] || {}), templateKey },
                            }))
                        }
                        onDelayChange={(delayMinutes) =>
                            setAutomationsConfig((prev) => ({
                                ...prev,
                                [key]: { ...(prev?.[key] || {}), delayMinutes },
                            }))
                        }
                    />
                );
            })}
        </>
    );

    return (
        <section className="empresa-section animate-in" style={{ animationDelay: '0.05s' }}>
            <div
                className="flex justify-between items-center mb-2"
                style={{ gap: 10, flexWrap: 'wrap' }}
            >
                <h3 className="navi-section-heading" style={{ margin: 0 }}>
                    Mensagens automáticas do funil
                </h3>
                {hasUnsavedChanges && (
                    <span className="funil-unsaved-pill" role="status">
                        Alterações não salvas
                    </span>
                )}
            </div>
            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Passo 1: personalize os textos em{' '}
                <Link to="/automacoes?tab=modelos" className="edit-link" style={{ fontWeight: 600 }}>
                    Modelos de Mensagem
                </Link>
                . Passo 2: ative os gatilhos abaixo. As mensagens disparam ao mover cards no funil ou ao
                agendar aulas.
            </p>
            <AutomacoesReadinessBanner readiness={readiness} />
            {readiness?.activeCount === 0 ? (
                <StatusBanner variant="info" className="mb-3">
                    Por padrão, todos os gatilhos vêm desligados. Isso é intencional — ative apenas os que sua
                    academia precisa, depois de conectar o WhatsApp e revisar os modelos de mensagem.
                </StatusBanner>
            ) : null}
            {renderGroup('Captação', AUTOMATION_GROUPS.captacao)}
            {renderGroup('Pós-matrícula', AUTOMATION_GROUPS.posMatricula)}
            <div className="flex justify-end mt-4">
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSave()}
                    disabled={savingAutomations || !hasUnsavedChanges}
                >
                    {savingAutomations ? 'Salvando...' : 'Salvar alterações'}
                </button>
            </div>
        </section>
    );
};

export default AutomacoesSection;
