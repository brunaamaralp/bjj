import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { account } from '../../lib/appwrite';
import { parseFaqItems } from '../../../lib/whatsappTemplateDefaults.js';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import AgenteChatSetup from '../inbox/AgenteChatSetup';

async function getJwt() {
    const jwt = await account.createJWT();
    return String(jwt?.jwt || '').trim();
}

function isPromptConfigured(intro, body) {
    return Boolean(String(intro || '').trim() || String(body || '').trim());
}

const AgenteIASection = ({ academyId, role }) => {
    const navigate = useNavigate();
    const addToast = useUiStore((s) => s.addToast);
    const academyIdRef = useRef(academyId);
    useEffect(() => { academyIdRef.current = academyId; }, [academyId]);

    const canConfigure = role === 'owner' || role === 'member';

    const [promptIntro, setPromptIntro] = useState('');
    const [promptBody, setPromptBody] = useState('');
    const [promptSuffix, setPromptSuffix] = useState('');
    const [promptSavedSnapshot, setPromptSavedSnapshot] = useState({ intro: '', body: '', suffix: '' });
    const [loadingPrompt, setLoadingPrompt] = useState(false);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [iaAtiva, setIaAtiva] = useState(false);
    const [togglingIa, setTogglingIa] = useState(false);
    const [birthdayMessage, setBirthdayMessage] = useState('');
    const [savingBirthdayMessage, setSavingBirthdayMessage] = useState(false);
    const [faqItems, setFaqItems] = useState([]);
    const [savingFaq, setSavingFaq] = useState(false);
    const [promptConfigurado, setPromptConfigurado] = useState(false);
    const [whatsappConectado, setWhatsappConectado] = useState(false);
    const [aiThreadsUsed, setAiThreadsUsed] = useState(0);
    const [aiThreadsLimit, setAiThreadsLimit] = useState(300);
    const [aiOverageEnabled, setAiOverageEnabled] = useState(true);
    const [showPromptPreview, setShowPromptPreview] = useState(false);
    const [promptPreviewText, setPromptPreviewText] = useState('');
    const [loadingPromptPreview, setLoadingPromptPreview] = useState(false);
    const [wizardAgenteInitial, setWizardAgenteInitial] = useState(null);
    const [agentModalOpen, setAgentModalOpen] = useState(false);

    useEffect(() => {
        if (!academyId || !canConfigure) return;
        let cancelled = false;
        (async () => {
            setLoadingPrompt(true);
            try {
                const jwt = await getJwt();
                const aid = String(academyId || '').trim();
                if (!aid) return;
                const headers = { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid };
                const [rPrompt, rInst] = await Promise.all([
                    fetchWithBillingGuard('/api/settings/ai-prompt', { headers }),
                    fetchWithBillingGuard('/api/zapster/instances', { headers })
                ]);
                if (rPrompt.blocked || rInst.blocked) return;
                const instRaw = await rInst.res.text();
                const instData = JSON.parse(instRaw || 'null') || {};
                const conectado = rInst.res.ok && String(instData?.status || '').trim() === 'connected';
                if (!cancelled) setWhatsappConectado(conectado);

                const data = await rPrompt.res.json();
                if (cancelled) return;
                if (rPrompt.res.ok && data && typeof data === 'object') {
                    const intro = String(data.prompt_intro || '');
                    const body = String(data.prompt_body || '');
                    const suffix = String(data.prompt_suffix || '');
                    setPromptIntro(intro);
                    setPromptBody(body);
                    setPromptSuffix(suffix);
                    setPromptSavedSnapshot({ intro, body, suffix });
                    setPromptConfigurado(isPromptConfigured(intro, body));
                    setIaAtiva(data.ia_ativa === true);
                    setBirthdayMessage(String(data.birthdayMessage || '').replaceAll('{nome}', '{primeiroNome}'));
                    setFaqItems(parseFaqItems(data.faq_data));
                    setAiThreadsUsed(Number(data.ai_threads_used) || 0);
                    setAiThreadsLimit(Number(data.ai_threads_limit) || 300);
                    setAiOverageEnabled(data.ai_overage_enabled !== false && data.ai_overage_enabled !== 'false');
                    const wd = String(data.wizard_data || '').trim();
                    if (wd) {
                        try {
                            const parsed = JSON.parse(wd);
                            setWizardAgenteInitial(parsed && typeof parsed === 'object' ? parsed : null);
                        } catch {
                            setWizardAgenteInitial(null);
                        }
                    } else {
                        setWizardAgenteInitial(null);
                    }
                } else {
                    throw new Error('Falha ao carregar');
                }
            } catch (e) {
                if (!cancelled) addToast({ type: 'error', message: e?.message || 'Erro ao carregar' });
            } finally {
                if (!cancelled) setLoadingPrompt(false);
            }
        })();
        return () => { cancelled = true; };
    }, [academyId, canConfigure]);

    useEffect(() => {
        if (!canConfigure || !promptConfigurado || !academyId) return;
        const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done;
        if (done) return;
        void useLeadStore.getState().completeOnboardingStepIds(['setup_ai']);
    }, [canConfigure, promptConfigurado, academyId]);

    useEffect(() => {
        if (!agentModalOpen) return;
        const onEsc = (e) => { if (e.key === 'Escape') setAgentModalOpen(false); };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [agentModalOpen]);

    async function savePromptSettings(overrides, { successMessage } = {}) {
        const use = overrides && typeof overrides === 'object' ? overrides : null;
        const intro = use && 'prompt_intro' in use ? String(use.prompt_intro) : String(promptIntro || '');
        const bodyPut = use && 'prompt_body' in use ? String(use.prompt_body) : String(promptBody || '');
        const suffixPut = use && 'prompt_suffix' in use ? String(use.prompt_suffix) : String(promptSuffix || '');
        setSavingPrompt(true);
        try {
            const jwt = await getJwt();
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || ''),
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ prompt_intro: intro, prompt_body: bodyPut, prompt_suffix: suffixPut })
            });
            if (blocked) return;
            const raw = await resp.text();
            if (!resp.ok) throw new Error(raw || 'Falha ao salvar');
            addToast({ type: 'success', message: successMessage ?? 'Instruções salvas' });
            setPromptSavedSnapshot({ intro, body: bodyPut, suffix: suffixPut });
            setPromptConfigurado(isPromptConfigured(intro, bodyPut));
            if (isPromptConfigured(intro, bodyPut)) {
                const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done;
                if (!done) void useLeadStore.getState().completeOnboardingStepIds(['setup_ai']);
            }
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao salvar' });
        } finally {
            setSavingPrompt(false);
        }
    }

    async function handleToggleIa() {
        if (!promptConfigurado || togglingIa) return;
        setTogglingIa(true);
        try {
            const jwt = await getJwt();
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || '')
                },
                body: JSON.stringify({ action: 'toggle_ia', ia_ativa: !iaAtiva })
            });
            if (blocked) return;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) setIaAtiva(data.ia_ativa === true);
            else addToast({ type: 'error', message: data?.erro || 'Não foi possível atualizar a IA' });
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao atualizar a IA' });
        } finally {
            setTogglingIa(false);
        }
    }

    async function handleSaveBirthdayMessage() {
        if (savingBirthdayMessage) return;
        setSavingBirthdayMessage(true);
        try {
            const jwt = await getJwt();
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || '')
                },
                body: JSON.stringify({ action: 'save_birthday_message', birthdayMessage })
            });
            if (blocked) return;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) {
                setBirthdayMessage(String(data.birthdayMessage ?? birthdayMessage));
                addToast({ type: 'success', message: 'Mensagem de aniversário salva' });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Não foi possível salvar' });
            }
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao salvar' });
        } finally {
            setSavingBirthdayMessage(false);
        }
    }

    async function handleSaveFaqData() {
        if (savingFaq) return;
        setSavingFaq(true);
        try {
            const jwt = await getJwt();
            const cleaned = faqItems
                .map((it) => ({ q: String(it?.q || '').trim(), a: String(it?.a || '').trim() }))
                .filter((it) => it.q && it.a);
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || '')
                },
                body: JSON.stringify({ action: 'save_faq_data', faq_data: cleaned })
            });
            if (blocked) return;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) {
                setFaqItems(parseFaqItems(data.faq_data));
                addToast({ type: 'success', message: 'Perguntas frequentes salvas' });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Não foi possível salvar' });
            }
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao salvar' });
        } finally {
            setSavingFaq(false);
        }
    }

    async function handlePreviewFullPrompt() {
        if (loadingPromptPreview) return;
        setLoadingPromptPreview(true);
        try {
            const jwt = await getJwt();
            const resp = await fetch('/api/settings/prompt-preview', {
                headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data?.sucesso) throw new Error(data?.erro || 'Não foi possível carregar a prévia');
            setPromptPreviewText(String(data.prompt || ''));
            setShowPromptPreview(true);
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao carregar prévia' });
        } finally {
            setLoadingPromptPreview(false);
        }
    }

    if (!canConfigure) {
        return (
            <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                    Apenas donos e membros da equipe podem configurar o Agente IA.
                </div>
            </section>
        );
    }

    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="agent-header">
                <h2 className="navi-section-heading" style={{ fontSize: '1.25rem', margin: '0 0 8px' }}>Assistente IA</h2>
                <p className="agent-subtitle">Configure como sua IA responde no WhatsApp</p>
            </div>

            <div className="agent-toggle-block">
                <div className="agent-toggle-row">
                    <span className="agent-toggle-label">{iaAtiva ? 'Assistente ligado' : 'Assistente desligado'}</span>
                    <button
                        type="button"
                        onClick={() => void handleToggleIa()}
                        disabled={!promptConfigurado || togglingIa}
                        className={`agent-toggle-btn${iaAtiva && promptConfigurado ? ' active' : ''}`}
                        title={
                            !promptConfigurado
                                ? 'Conclua a configuração do assistente antes de ativar'
                                : togglingIa
                                    ? 'Atualizando…'
                                    : iaAtiva ? 'Desativar assistente' : 'Ativar assistente'
                        }
                    >
                        {togglingIa ? '…' : iaAtiva ? 'Ligado' : 'Desligado'}
                    </button>
                </div>
                {!promptConfigurado && !iaAtiva && (
                    <p className="agent-toggle-hint">
                        Conclua a configuração do assistente abaixo para poder ativá-lo.
                    </p>
                )}
                {iaAtiva && !promptConfigurado && (
                    <p className="agent-warning">Conclua a configuração do assistente para ele funcionar corretamente.</p>
                )}
                {!iaAtiva && promptConfigurado && (
                    <p className="agent-info">Instruções salvas. Ligue o assistente para começar a responder no WhatsApp.</p>
                )}
                {promptConfigurado && !whatsappConectado && (
                    <p className="agent-info" style={{ marginTop: 8 }}>
                        WhatsApp ainda não está conectado.{' '}
                        <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '2px 10px', minHeight: 30, fontSize: 12, verticalAlign: 'middle' }}
                            onClick={() => navigate('/inbox?tab=dispositivo')}
                        >
                            Abrir conexão do WhatsApp
                        </button>
                    </p>
                )}
                {iaAtiva && aiThreadsLimit > 0 && aiThreadsUsed >= aiThreadsLimit && !aiOverageEnabled && (
                    <p className="agent-warning" style={{ marginTop: 8 }}>
                        Limite de conversas com IA atingido neste ciclo ({aiThreadsUsed}/{aiThreadsLimit}). O atendimento automático pode ficar
                        indisponível para novas conversas até o próximo ciclo ou até ativar excedente no plano.
                    </p>
                )}
            </div>

            <div className="agent-instructions agent-instructions-panel">
                <div className="agent-instructions-header">
                    <h3 className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0 }}>
                        Instruções do assistente
                    </h3>
                </div>
                <p className="agent-subtitle" style={{ margin: '0 0 12px' }}>
                    Configure o assistente respondendo às perguntas guiadas. No final, as instruções são geradas e salvas automaticamente.
                </p>
                <div className="agent-status-card">
                    <div className="agent-status-row">
                        <span className={`agent-status-dot ${promptConfigurado ? 'agent-status-dot--configured' : 'agent-status-dot--pending'}`} />
                        <span className="agent-status-label">
                            {loadingPrompt
                                ? 'Carregando…'
                                : promptConfigurado
                                    ? 'Assistente configurado'
                                    : 'Assistente ainda não configurado'}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="agent-config-btn"
                        disabled={loadingPrompt}
                        onClick={() => setAgentModalOpen(true)}
                    >
                        {promptConfigurado ? 'Reconfigurar assistente' : 'Configurar assistente'}
                    </button>
                </div>
                <div className="agent-actions" style={{ marginTop: 14 }}>
                    <div className="agent-actions-left" />
                    <div className="agent-actions-right">
                        <button
                            type="button"
                            onClick={() => void handlePreviewFullPrompt()}
                            className="btn btn-outline"
                            disabled={loadingPrompt || savingPrompt || loadingPromptPreview}
                            title="Inclui classificação em JSON enviada ao modelo"
                        >
                            {loadingPromptPreview ? 'Carregando…' : 'Ver como a IA recebe'}
                        </button>
                    </div>
                </div>
            </div>

            <details className="agent-accordion">
                <summary>Mensagem de aniversário (resposta da IA)</summary>
                <div className="agent-accordion-content">
                    <p className="agent-field-hint">
                        Texto de referência para quando o aluno escreve no <strong>dia do aniversário</strong>. Use {'{primeiroNome}'} para personalizar.
                    </p>
                    <textarea
                        className="agent-field-textarea input"
                        value={birthdayMessage}
                        onChange={(e) => setBirthdayMessage(e.target.value)}
                        rows={3}
                        disabled={loadingPrompt}
                        placeholder="Ex: Feliz aniversário, {primeiroNome}! A equipe deseja um dia incrível…"
                    />
                    <button
                        type="button"
                        onClick={() => void handleSaveBirthdayMessage()}
                        className="btn btn-outline"
                        style={{ marginTop: 8 }}
                        disabled={savingBirthdayMessage || loadingPrompt}
                    >
                        {savingBirthdayMessage ? 'Salvando…' : 'Salvar mensagem'}
                    </button>
                </div>
            </details>

            <details className="agent-accordion">
                <summary>Perguntas frequentes</summary>
                <div className="agent-accordion-content">
                    <p className="agent-field-hint">
                        Pares pergunta/resposta entram no contexto do assistente como base factual.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {faqItems.map((item, idx) => (
                            <div
                                key={idx}
                                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
                            >
                                <input
                                    className="input"
                                    value={item.q}
                                    onChange={(e) => { const v = e.target.value; setFaqItems((prev) => prev.map((p, i) => (i === idx ? { ...p, q: v } : p))); }}
                                    placeholder="Pergunta"
                                    disabled={loadingPrompt}
                                />
                                <textarea
                                    className="agent-field-textarea input"
                                    value={item.a}
                                    onChange={(e) => { const v = e.target.value; setFaqItems((prev) => prev.map((p, i) => (i === idx ? { ...p, a: v } : p))); }}
                                    placeholder="Resposta"
                                    rows={3}
                                    disabled={loadingPrompt}
                                />
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ alignSelf: 'flex-start' }}
                                    onClick={() => setFaqItems((prev) => prev.filter((_, i) => i !== idx))}
                                    disabled={loadingPrompt}
                                >
                                    Remover
                                </button>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setFaqItems((prev) => [...prev, { q: '', a: '' }])}
                            disabled={loadingPrompt}
                        >
                            + Adicionar pergunta
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => void handleSaveFaqData()}
                            disabled={savingFaq || loadingPrompt}
                        >
                            {savingFaq ? 'Salvando…' : 'Salvar perguntas frequentes'}
                        </button>
                    </div>
                </div>
            </details>

            {showPromptPreview && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Como a IA recebe suas instruções"
                    style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={() => setShowPromptPreview(false)}
                >
                    <div
                        style={{ maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, boxShadow: 'var(--shadow)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                <div>
                                    <span style={{ fontWeight: 700, fontSize: 15 }}>Como a IA recebe suas instruções</span>
                                    <p className="agent-subtitle" style={{ margin: '6px 0 0', maxWidth: 520 }}>
                                        Este é o texto completo enviado ao assistente antes de cada conversa.
                                    </p>
                                </div>
                                <button type="button" className="btn btn-outline" style={{ padding: '4px 12px', flexShrink: 0 }} onClick={() => setShowPromptPreview(false)}>
                                    Fechar
                                </button>
                            </div>
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, color: 'var(--text)', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                            {promptPreviewText}
                        </pre>
                    </div>
                </div>
            )}

            {agentModalOpen && (
                <div
                    className="agent-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Configuração do assistente"
                    onClick={() => setAgentModalOpen(false)}
                >
                    <div className="agent-modal-panel" onClick={(e) => e.stopPropagation()}>
                        <AgenteChatSetup
                            academyId={String(academyId || '')}
                            getJwt={getJwt}
                            wizardInitial={wizardAgenteInitial}
                            loading={loadingPrompt}
                            onWizardReset={() =>
                                setWizardAgenteInitial({ step: 0, answers: {}, savedAt: new Date().toISOString() })
                            }
                            onComplete={async ({ intro, body, suffix, wizardPayload }) => {
                                setPromptIntro(intro);
                                setPromptBody(body);
                                setPromptSuffix(suffix);
                                setWizardAgenteInitial(wizardPayload && typeof wizardPayload === 'object' ? wizardPayload : null);
                                await savePromptSettings(
                                    { prompt_intro: intro, prompt_body: body, prompt_suffix: suffix },
                                    { successMessage: 'Assistente configurado com sucesso!' }
                                );
                                setAgentModalOpen(false);
                            }}
                        />
                    </div>
                </div>
            )}
        </section>
    );
};

export default AgenteIASection;
