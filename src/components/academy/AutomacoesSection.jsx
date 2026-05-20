import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AUTOMATION_DELAY_OPTIONS,
    AUTOMATION_GROUPS,
    serializeAutomationsConfig,
} from '../../lib/useAutomations.js';

function AutomationRow({
    automationKey,
    meta,
    cfg,
    noTemplatesAvailable,
    templateOptions,
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
                                ? 'Crie um template em Templates antes de ativar'
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
            <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
                <select
                    className="form-input"
                    value={noTemplatesAvailable ? '' : cfg.templateKey || ''}
                    disabled={noTemplatesAvailable}
                    onChange={(e) => onTemplateChange(e.target.value)}
                    style={{ flex: '1 1 220px' }}
                >
                    {noTemplatesAvailable ? (
                        <option value="" disabled>
                            Nenhum template disponível — crie em Templates
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
                    >
                        {delayOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                ) : null}
            </div>
        </div>
    );
}

const AutomacoesSection = ({
    automationLabels,
    automationsConfig,
    setAutomationsConfig,
    templateOptions,
    noTemplatesAvailable,
    automationsConfigRaw,
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
                    Mensagens automáticas
                </h3>
                {hasUnsavedChanges && (
                    <span className="funil-unsaved-pill" role="status">
                        Alterações não salvas
                    </span>
                )}
            </div>
            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.5 }}>
                Enviadas automaticamente quando um evento ocorre no funil. Os textos são configurados em{' '}
                <Link to="/templates" className="edit-link" style={{ fontWeight: 600 }}>
                    Templates
                </Link>
                .
            </p>
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
