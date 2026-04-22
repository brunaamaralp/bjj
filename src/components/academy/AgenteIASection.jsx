import React, { useState, useEffect, useRef, useMemo } from 'react';
import { account } from '../../lib/appwrite';
import { parseFaqItems } from '../../../lib/whatsappTemplateDefaults.js';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { Smartphone, Bot, AlertTriangle, QrCode, Power, RefreshCw, Unplug, HelpCircle } from 'lucide-react';
import AgenteChatSetup from '../inbox/AgenteChatSetup';

async function getJwt() {
    const jwt = await account.createJWT();
    return String(jwt?.jwt || '').trim();
}

function isPromptConfigured(intro, body) {
    return Boolean(String(intro || '').trim() || String(body || '').trim());
}

function formatInstructionsSavedAt(iso) {
    const s = String(iso || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Rótulo curto para o status da conexão WhatsApp na UI do Agente (não conectado). */
function formatWaAgentStatus(status) {
    const k = String(status || '').trim().toLowerCase();
    if (!k) return 'Em configuração';
    if (k === 'offline') return 'Conexão desligada';
    if (k === 'open' || k === 'scanning' || k === 'qrcode') return 'Aguardando leitura do QR';
    if (k === 'connecting' || k === 'syncing') return 'Conectando…';
    if (k === 'disconnected') return 'Desvinculado do WhatsApp';
    if (k === 'unknown') return 'Em verificação';
    return String(status).replace(/_/g, ' ');
}

/** Ícone + cores para a faixa de status (conexão não ativa). */
function waAgentStatusVisual(status) {
    const k = String(status || '').trim().toLowerCase();
    if (k === 'offline') return { Icon: Power, accent: '#c2410c', bg: 'rgba(194, 65, 12, 0.08)' };
    if (k === 'open' || k === 'scanning' || k === 'qrcode') return { Icon: QrCode, accent: '#128C7E', bg: 'rgba(18, 140, 126, 0.08)' };
    if (k === 'connecting' || k === 'syncing') return { Icon: RefreshCw, accent: '#5b3fbf', bg: 'rgba(91, 63, 191, 0.08)' };
    if (k === 'disconnected') return { Icon: Unplug, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
    return { Icon: HelpCircle, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
}

const cardBase = {
    borderRadius: 12,
    padding: 20,
    boxShadow: 'none',
};

const AgenteIASection = ({ academyId, role, academyDoc }) => {
    const addToast = useUiStore((s) => s.addToast);
    const academyIdRef = useRef(academyId);
    useEffect(() => { academyIdRef.current = academyId; }, [academyId]);

    const canConfigure = role === 'owner' || role === 'member';
    const isOwner = role === 'owner';

    const zap = useZapsterWhatsAppConnection(academyId);

    const shouldLoadWaQr =
        zap.waQrShown &&
        zap.waInfo?.status !== 'connected' &&
        !!zap.waInfo?.instance_id &&
        !zap.waTokenMissing &&
        !zap.waQrError;

    useEffect(() => {
        if (!shouldLoadWaQr) {
            if (waQrBlobUrlRef.current) {
                URL.revokeObjectURL(waQrBlobUrlRef.current);
                waQrBlobUrlRef.current = null;
            }
            setWaQrBlobUrl(null);
            return;
        }
        let cancelled = false;
        const instanceId = String(zap.waInfo.instance_id);
        (async () => {
            const prev = waQrBlobUrlRef.current;
            if (prev) {
                URL.revokeObjectURL(prev);
                waQrBlobUrlRef.current = null;
            }
            setWaQrBlobUrl(null);
            const url = await zap.fetchQrCode(instanceId);
            if (cancelled) {
                if (url) URL.revokeObjectURL(url);
                return;
            }
            if (!url) {
                zap.onQrImageError();
                return;
            }
            waQrBlobUrlRef.current = url;
            setWaQrBlobUrl(url);
        })();
        return () => {
            cancelled = true;
        };
    }, [
        shouldLoadWaQr,
        zap.waInfo?.instance_id,
        zap.waQrTick,
        zap.fetchQrCode,
        zap.onQrImageError,
    ]);

    useEffect(() => {
        if (!academyId) return;
        const connected = String(zap.waInfo?.status || '').trim() === 'connected';
        if (!connected) return;
        const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
        if (done) return;
        void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
    }, [zap.waInfo?.status, academyId]);

    const [promptIntro, setPromptIntro] = useState('');
    const [promptBody, setPromptBody] = useState('');
    const [promptSuffix, setPromptSuffix] = useState('');
    const [, setPromptSavedSnapshot] = useState({ intro: '', body: '', suffix: '' });
    const [loadingPrompt, setLoadingPrompt] = useState(false);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [iaAtiva, setIaAtiva] = useState(false);
    const [togglingIa, setTogglingIa] = useState(false);
    const [birthdayMessage, setBirthdayMessage] = useState('');
    const [savingBirthdayMessage, setSavingBirthdayMessage] = useState(false);
    const [faqItems, setFaqItems] = useState([]);
    const [savingFaq, setSavingFaq] = useState(false);
    const [promptConfigurado, setPromptConfigurado] = useState(false);
    const [aiThreadsUsed, setAiThreadsUsed] = useState(0);
    const [aiThreadsLimit, setAiThreadsLimit] = useState(300);
    const [aiOverageEnabled, setAiOverageEnabled] = useState(true);
    const [showPromptPreview, setShowPromptPreview] = useState(false);
    const [promptPreviewText, setPromptPreviewText] = useState('');
    const [loadingPromptPreview, setLoadingPromptPreview] = useState(false);
    const [wizardAgenteInitial, setWizardAgenteInitial] = useState(null);
    const [waConfirm, setWaConfirm] = useState(null);
    const [waQrBlobUrl, setWaQrBlobUrl] = useState(null);
    const waQrBlobUrlRef = useRef(null);

    // Fluxo do card Assistente IA (sequencial)
    const [showWizard, setShowWizard] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [showTestChat, setShowTestChat] = useState(false);

    // Editor de prompt (intro/body editáveis)
    const [editIntro, setEditIntro] = useState('');
    const [editBody, setEditBody] = useState('');
    const [promptIntroBackup, setPromptIntroBackup] = useState('');
    const [promptBodyBackup, setPromptBodyBackup] = useState('');
    const [promptUpdatedAt, setPromptUpdatedAt] = useState('');

    // Dados para o chat de teste
    const [aiName, setAiName] = useState('');
    const [academyName, setAcademyName] = useState(String(academyDoc?.name || '').trim());
    const [testMessagesToday, setTestMessagesToday] = useState(0);
    const [testMessagesResetDate, setTestMessagesResetDate] = useState('');

    useEffect(() => {
        if (!waConfirm) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') setWaConfirm(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [waConfirm]);

    const handleWaConfirmAction = () => {
        if (!waConfirm) return;
        const { variant } = waConfirm;
        setWaConfirm(null);
        if (variant === 'disconnect') void zap.disconnectWaInstance();
        if (variant === 'powerOff') void zap.powerOffInstance();
        if (variant === 'restart') void zap.restartInstance();
    };

    const instructionsSavedLabel = useMemo(
        () => formatInstructionsSavedAt(wizardAgenteInitial?.savedAt),
        [wizardAgenteInitial?.savedAt]
    );

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
                const rPrompt = await fetchWithBillingGuard('/api/settings/ai-prompt', { headers });
                if (rPrompt.blocked) return;

                const data = await rPrompt.res.json();
                if (cancelled) return;
                if (rPrompt.res.ok && data && typeof data === 'object') {
                    const intro = String(data.prompt_intro || '');
                    const body = String(data.prompt_body || '');
                    const suffix = String(data.prompt_suffix || '');
                    const introBackup = String(data.prompt_intro_backup || '');
                    const bodyBackup = String(data.prompt_body_backup || '');
                    const updatedAt = String(data.prompt_updated_at || '');
                    setPromptIntro(intro);
                    setPromptBody(body);
                    setPromptSuffix(suffix);
                    setPromptSavedSnapshot({ intro, body, suffix });
                    setPromptConfigurado(isPromptConfigured(intro, body));

                    setPromptIntroBackup(introBackup);
                    setPromptBodyBackup(bodyBackup);
                    setPromptUpdatedAt(updatedAt);

                    setAiName(String(data.ai_name || '').trim());
                    if (data.academy_name) setAcademyName(String(data.academy_name || '').trim());
                    setTestMessagesToday(Number(data.test_messages_today) || 0);
                    setTestMessagesResetDate(String(data.test_messages_reset_date || '').trim());

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
    }, [academyId, canConfigure, addToast]);

    useEffect(() => {
        if (!canConfigure || !promptConfigurado || !academyId) return;
        const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done;
        if (done) return;
        void useLeadStore.getState().completeOnboardingStepIds(['setup_ai']);
    }, [canConfigure, promptConfigurado, academyId]);

    useEffect(() => {
        // Mantém o nome da academia sincronizado se o props vier atualizado.
        setAcademyName(String(academyDoc?.name || '').trim());
    }, [academyDoc?.name]);

    async function savePromptSettings(overrides, { successMessage } = {}) {
        const use = overrides && typeof overrides === 'object' ? overrides : null;
        const intro = use && 'prompt_intro' in use ? String(use.prompt_intro) : String(promptIntro || '');
        const bodyPut = use && 'prompt_body' in use ? String(use.prompt_body) : String(promptBody || '');
        const suffixPut = use && 'prompt_suffix' in use ? String(use.prompt_suffix) : String(promptSuffix || '');
        setSavingPrompt(true);
        try {
            const prevIntro = String(promptIntro || '');
            const prevBody = String(promptBody || '');
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

            // Atualiza estado local para refletir o prompt salvo (e preparar a restauração).
            setPromptIntro(intro);
            setPromptBody(bodyPut);
            setPromptSuffix(suffixPut);
            setPromptIntroBackup(prevIntro);
            setPromptBodyBackup(prevBody);
            setPromptUpdatedAt(new Date().toISOString());

            setPromptSavedSnapshot({ intro, body: bodyPut, suffix: suffixPut });
            setPromptConfigurado(isPromptConfigured(intro, bodyPut));
            if (isPromptConfigured(intro, bodyPut)) {
                const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done;
                if (!done) void useLeadStore.getState().completeOnboardingStepIds(['setup_ai']);
            }
            return true;
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao salvar' });
            return false;
        } finally {
            setSavingPrompt(false);
        }
    }

    async function handleToggleIa(nextActive) {
        if (!promptConfigurado || togglingIa) return false;
        const target = typeof nextActive === 'boolean' ? nextActive : !iaAtiva;
        if (target === iaAtiva) return true;
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
                body: JSON.stringify({ action: 'toggle_ia', ia_ativa: target })
            });
            if (blocked) return false;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) {
                setIaAtiva(data.ia_ativa === true);
                return true;
            }
            addToast({ type: 'error', message: data?.erro || 'Não foi possível atualizar a IA' });
            return false;
        } catch (e) {
            addToast({ type: 'error', message: e?.message || 'Erro ao atualizar a IA' });
            return false;
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

    function getTodayIso() {
        return new Date().toISOString().split('T')[0];
    }

    const AdvancedOptionsAccordion = () => (
        <details className="agent-accordion" style={{ marginTop: 20 }}>
            <summary>Opções avançadas</summary>
            <div className="agent-accordion-content">
                <details className="agent-accordion agent-accordion-nested" style={{ marginBottom: 16 }}>
                    <summary className="text-small" style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Detalhes para suporte
                    </summary>
                    <p className="text-small agent-field-hint" style={{ marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
                        O assistente também recebe dados estruturados do lead (formato JSON) junto com o texto. Use <strong>Ver como a IA recebe</strong> abaixo para inspecionar o conteúdo completo.
                    </p>
                </details>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button
                        type="button"
                        onClick={() => void handlePreviewFullPrompt()}
                        className="btn btn-outline"
                        disabled={loadingPrompt || savingPrompt || loadingPromptPreview}
                        title="Mostra o texto completo enviado ao modelo, incluindo dados estruturados do lead"
                    >
                        {loadingPromptPreview ? 'Carregando…' : 'Ver como a IA recebe'}
                    </button>
                </div>

                <div className="agent-field" style={{ marginBottom: 16 }}>
                    <div className="navi-section-heading" style={{ fontSize: '0.95rem', marginBottom: 8 }}>Mensagem de aniversário</div>
                    <p className="agent-field-hint">
                        Texto de referência para quando o aluno escreve no <strong>dia do aniversário</strong>. Use {'{primeiroNome}'} para personalizar.
                    </p>
                    <textarea
                        className="agent-prompt-textarea agent-prompt-textarea--sm"
                        value={birthdayMessage}
                        onChange={(e) => setBirthdayMessage(e.target.value)}
                        rows={3}
                        disabled={loadingPrompt}
                        placeholder="Ex: Feliz aniversário, {primeiroNome}! A equipe deseja um dia incrível…"
                        spellCheck
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

                <div className="navi-section-heading" style={{ fontSize: '0.95rem', marginBottom: 8 }}>Perguntas frequentes</div>
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
                                className="form-input"
                                value={item.q}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setFaqItems((prev) => prev.map((p, i) => (i === idx ? { ...p, q: v } : p)));
                                }}
                                placeholder="Pergunta"
                                disabled={loadingPrompt}
                            />
                            <textarea
                                className="agent-prompt-textarea agent-prompt-textarea--sm"
                                value={item.a}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setFaqItems((prev) => prev.map((p, i) => (i === idx ? { ...p, a: v } : p)));
                                }}
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
    );

    const EditorDePrompt = () => {
        const hasBackup = Boolean(String(promptIntroBackup || '').trim() || String(promptBodyBackup || '').trim());

        const handleRestoreBackup = () => {
            if (!hasBackup) return;
            setEditIntro(promptIntroBackup);
            setEditBody(promptBodyBackup);
            addToast({ type: 'info', message: 'Versão anterior restaurada. Salve para confirmar.' });
        };

        const handleCancel = () => {
            setShowEditor(false);
            setShowWizard(false);
            setShowTestChat(false);
        };

        const handleSaveAndTest = async () => {
            const ok = await savePromptSettings(
                { prompt_intro: editIntro, prompt_body: editBody, prompt_suffix: promptSuffix },
                { successMessage: 'Prompt atualizado com sucesso!' }
            );
            if (!ok) return;
            setShowEditor(false);
            setShowWizard(false);
            setShowTestChat(true);
        };

        return (
            <div className="agent-prompt-editor animate-in">
                <header className="agent-prompt-editor__header">
                    <div>
                        <h4 className="agent-prompt-editor__title">Revisar & Editar instruções do assistente</h4>
                        {promptUpdatedAt && (
                            <p className="text-small" style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                                Atualizado em {formatInstructionsSavedAt(promptUpdatedAt)}
                            </p>
                        )}
                    </div>
                    <button type="button" className="btn btn-outline" style={{ padding: '8px 14px', flexShrink: 0 }} onClick={handleCancel}>
                        Cancelar
                    </button>
                </header>

                <section className="agent-prompt-field" aria-labelledby="agent-prompt-identidade">
                    <h5 id="agent-prompt-identidade" className="agent-prompt-field__label">
                        Identidade
                    </h5>
                    <p className="agent-prompt-field__hint">Quem é o assistente, nome e tom de voz</p>
                    <textarea
                        className="agent-prompt-textarea agent-prompt-textarea--md"
                        value={editIntro}
                        onChange={(e) => setEditIntro(e.target.value)}
                        rows={6}
                        disabled={savingPrompt}
                        placeholder="Ex.: Você é a Ana, atendente do estúdio…"
                        spellCheck
                    />
                    <div className="agent-prompt-meta">{String(editIntro || '').length} caracteres</div>
                </section>

                <section className="agent-prompt-field" aria-labelledby="agent-prompt-conhecimento">
                    <h5 id="agent-prompt-conhecimento" className="agent-prompt-field__label">
                        Conhecimento
                    </h5>
                    <p className="agent-prompt-field__hint">Planos, horários, preços, regras e o que o assistente pode informar</p>
                    <textarea
                        className="agent-prompt-textarea agent-prompt-textarea--lg"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={12}
                        disabled={savingPrompt}
                        placeholder="Ex.: Endereço, modalidades, valores, política de experimental…"
                        spellCheck
                    />
                    <div className="agent-prompt-meta">{String(editBody || '').length} caracteres</div>
                </section>

                <section className="agent-prompt-field" aria-labelledby="agent-prompt-sistema">
                    <h5 id="agent-prompt-sistema" className="agent-prompt-field__label">
                        Regras do sistema{' '}
                        <span className="badge badge-info" style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                            Fixo
                        </span>
                    </h5>
                    <p className="agent-prompt-field__hint">
                        Regras obrigatórias — não editáveis. Inclui respostas em texto de conversa (sem markdown nem listas) no que vai para o
                        WhatsApp.
                    </p>
                    <pre className="agent-prompt-readonly" tabIndex={0}>
                        {promptSuffix}
                    </pre>
                </section>

                <footer className="agent-prompt-footer">
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={!hasBackup || savingPrompt}
                        onClick={() => void handleRestoreBackup()}
                        title={!hasBackup ? 'Nenhuma versão anterior disponível' : 'Restaurar versão anterior'}
                    >
                        ↩ Restaurar versão anterior
                    </button>

                    <button type="button" className="btn btn-primary" disabled={savingPrompt} onClick={() => void handleSaveAndTest()}>
                        {savingPrompt ? 'Salvando…' : 'Salvar e testar'}
                    </button>
                </footer>
            </div>
        );
    };

    const ChatDeTeste = () => {
        const todayIso = getTodayIso();
        const usedToday = testMessagesResetDate === todayIso ? (Number(testMessagesToday) || 0) : 0;
        const testsLimit = 10;
        const initialTestsLeft = Math.max(0, testsLimit - usedToday);

        const [messages, setMessages] = useState([
            {
                role: 'assistant',
                content: `Olá! Sou ${aiName || 'assistente'}, assistente configurado para ${academyName || 'sua academia'}. Como posso ajudar? (Modo de teste)`
            }
        ]);
        const [input, setInput] = useState('');
        const [sending, setSending] = useState(false);
        const [testsLeft, setTestsLeftLocal] = useState(initialTestsLeft);

        const handleClose = () => {
            setShowTestChat(false);
            if (!iaAtiva) setShowEditor(true);
        };

        const handleActivate = async () => {
            const ok = await handleToggleIa(true);
            if (!ok) return;
            setShowTestChat(false);
            setShowEditor(false);
            setShowWizard(false);
        };

        const handleSend = async () => {
            if (!input.trim() || sending || testsLeft <= 0) return;
            const userMsg = { role: 'user', content: input.trim() };
            const historyForRequest = messages;

            setMessages((prev) => [...prev, userMsg]);
            setInput('');
            setSending(true);

            try {
                const jwt = await getJwt();
                const { blocked, res: resp } = await fetchWithBillingGuard('/api/agent/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${jwt}`,
                        'x-academy-id': String(academyId || '').trim()
                    },
                    body: JSON.stringify({
                        academyId,
                        message: userMsg.content,
                        history: historyForRequest
                    })
                });

                if (blocked || !resp) return;

                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    if (resp.status === 429) {
                        addToast({ type: 'warning', message: data?.message || 'Limite diário atingido' });
                        setTestsLeftLocal(0);
                        return;
                    }
                    addToast({ type: 'error', message: data?.erro || data?.message || 'Falha ao testar assistente' });
                    return;
                }

                setMessages((prev) => [...prev, { role: 'assistant', content: data?.response || '' }]);
                const nextUsed = Number(data?.testsUsedToday) || (usedToday + 1);
                const nextLeft = Math.max(0, testsLimit - nextUsed);
                setTestsLeftLocal(nextLeft);
                setTestMessagesToday(nextUsed);
                setTestMessagesResetDate(todayIso);
            } catch (e) {
                addToast({ type: 'error', message: e?.message || 'Erro ao enviar teste' });
            } finally {
                setSending(false);
            }
        };

        return (
            <div className="agent-chat-container" style={{ marginTop: 12 }}>
                <div className="agent-chat-header" style={{ paddingBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                            <div className="agent-chat-title" style={{ fontSize: 14 }}>Modo de teste — não envia ao WhatsApp</div>
                            <div className="agent-chat-subtitle" style={{ marginTop: 6 }}>
                                {testsLeft} de 10 testes restantes hoje
                            </div>
                        </div>
                        <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', flexShrink: 0 }} onClick={handleClose} disabled={sending}>
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="agent-chat-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`agent-chat-bubble ${msg.role === 'assistant' ? 'nave' : 'user'}`}>
                            <div className="agent-chat-content">
                                <div className="agent-chat-text">{msg.content}</div>
                            </div>
                        </div>
                    ))}

                    {sending && (
                        <div className="agent-chat-bubble nave">
                            <div className="agent-chat-typing" aria-label="Digitando…">
                                <span />
                                <span />
                                <span />
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
                    {testsLeft > 0 ? (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleSend();
                                    }
                                }}
                                placeholder="Simule uma mensagem de um lead…"
                                rows={2}
                                disabled={sending}
                                style={{ flex: 1 }}
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void handleSend()}
                                disabled={!input.trim() || sending}
                                style={{ minWidth: 108 }}
                            >
                                {sending ? 'Enviando…' : 'Enviar'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p style={{ margin: 0, fontWeight: 700 }}>Limite de 10 testes atingido hoje.</p>
                            <p className="text-small" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                Volte amanhã para continuar testando, ou ative o assistente se estiver satisfeito.
                            </p>
                            <button type="button" className="btn btn-primary" onClick={() => void handleActivate()} disabled={togglingIa}>
                                Ativar assistente
                            </button>
                        </div>
                    )}

                    {testsLeft > 0 && messages.length > 2 && (
                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Gostou das respostas?
                            </span>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleActivate()} disabled={togglingIa}>
                                Ativar assistente
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const waStatusVisual = useMemo(() => waAgentStatusVisual(zap.waInfo?.status), [zap.waInfo?.status]);
    const WaStatusIcon = waStatusVisual.Icon;

    const card1Connected = zap.waConnected;
    const card1Style = card1Connected
        ? {
            ...cardBase,
            border: '1px solid rgba(37, 211, 102, 0.3)',
            background: 'rgba(37, 211, 102, 0.04)',
        }
        : {
            ...cardBase,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
        };

    const card2Active = promptConfigurado && iaAtiva;
    const card2Style = card2Active
        ? {
            ...cardBase,
            border: '1px solid rgba(91, 63, 191, 0.3)',
            background: 'rgba(91, 63, 191, 0.04)',
        }
        : {
            ...cardBase,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
        };

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
        <section className="empresa-section animate-in" style={{ animationDelay: '0.05s', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card 1 — WhatsApp */}
            <div style={card1Style}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: card1Connected ? 12 : 16, flexWrap: 'wrap' }}>
                    <Smartphone size={22} strokeWidth={1.75} color={card1Connected ? '#25D366' : 'var(--text-secondary)'} aria-hidden />
                    <span className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0, flex: 1 }}>
                        Conexão WhatsApp
                    </span>
                    {card1Connected && (
                        <span className="text-small" style={{ color: '#25D366', fontWeight: 700 }}>
                            ● Conectado
                        </span>
                    )}
                </div>

                {card1Connected ? (
                    <>
                        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            WhatsApp conectado e pronto para uso
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                            {isOwner && (
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                    onClick={() =>
                                        setWaConfirm({
                                            variant: 'disconnect',
                                            title: 'Desconectar WhatsApp?',
                                            description: 'O assistente vai parar de responder até você conectar novamente.',
                                            confirmLabel: 'Desconectar',
                                        })
                                    }
                                    disabled={zap.waLoading || zap.waTokenMissing}
                                >
                                    Desconectar
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {zap.waTokenMissing && (
                            <div className="device-config-error" role="alert" style={{ marginBottom: 16 }}>
                                <AlertTriangle size={22} aria-hidden />
                                <div>
                                    <strong>Configuração incompleta</strong>
                                    <p>O token de acesso ao WhatsApp não está configurado. Entre em contato com o suporte para finalizar a configuração.</p>
                                </div>
                            </div>
                        )}
                        {zap.waPersistFailed && (
                            <div
                                style={{
                                    padding: 12,
                                    marginBottom: 16,
                                    borderRadius: 8,
                                    background: 'var(--warning-light)',
                                    color: 'var(--warning)',
                                }}
                            >
                                <p className="text-small" style={{ margin: 0, lineHeight: 1.45 }}>
                                    A conexão foi criada, mas não foi possível salvar os dados no sistema. Use <strong>Verificar e corrigir</strong> nas ferramentas abaixo, se disponível.
                                </p>
                            </div>
                        )}

                        {!zap.waInfo?.instance_id && (
                            <div style={{ textAlign: 'center', padding: '8px 0 16px', maxWidth: 420, margin: '0 auto' }}>
                                <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text)' }}>Primeiro passo</p>
                                <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.55 }}>
                                    {isOwner
                                        ? 'Crie a conexão desta academia com o WhatsApp. Na sequência você poderá exibir o código QR para escanear no celular.'
                                        : 'Peça ao dono da academia para iniciar a conexão com o WhatsApp aqui.'}
                                </p>
                                {isOwner && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => void zap.createWaInstance()}
                                        disabled={zap.waLoading || zap.waTokenMissing}
                                    >
                                        {zap.waLoading ? 'Aguarde…' : 'Começar conexão WhatsApp'}
                                    </button>
                                )}
                            </div>
                        )}

                        {!!zap.waInfo?.instance_id && !zap.waTokenMissing && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    gap: 16,
                                    width: '100%',
                                    maxWidth: 440,
                                    margin: '0 auto',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: 12,
                                        padding: '12px 14px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border)',
                                        background: waStatusVisual.bg,
                                        borderLeft: `4px solid ${waStatusVisual.accent}`,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                        <WaStatusIcon size={20} color={waStatusVisual.accent} strokeWidth={2} aria-hidden />
                                        <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            Status da conexão
                                        </span>
                                    </div>
                                    <span className="text-small" style={{ fontWeight: 700, color: 'var(--text)' }}>
                                        {formatWaAgentStatus(zap.waInfo?.status)}
                                    </span>
                                </div>

                                {!zap.waQrShown && (
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            padding: '18px 16px',
                                            borderRadius: 12,
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                        }}
                                    >
                                        <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.98rem', color: 'var(--text)' }}>
                                            Parear com o celular
                                        </p>
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.55 }}>
                                            {isOwner ? (
                                                <>
                                                    No celular, abra o <strong>WhatsApp</strong> → menu (três pontos ou configurações) →{' '}
                                                    <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>. Depois toque em{' '}
                                                    <strong>Exibir código QR</strong> aqui e aponte a câmera para a tela.
                                                </>
                                            ) : (
                                                <>Somente o dono da academia pode abrir o código QR nesta página. Você pode atualizar o status abaixo para ver se a conexão já foi feita.</>
                                            )}
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                                            {isOwner && (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    onClick={() => zap.revealWaQrCode()}
                                                    disabled={zap.waLoading || zap.waTokenMissing}
                                                >
                                                    Exibir código QR
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                style={{ padding: '8px 14px' }}
                                                onClick={() => void zap.fetchWaInfo()}
                                                disabled={zap.waLoading || zap.waTokenMissing}
                                            >
                                                Atualizar status
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {zap.waQrShown && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                                            {waQrBlobUrl ? (
                                                <img
                                                    src={waQrBlobUrl}
                                                    alt="QR Code WhatsApp"
                                                    onLoad={() => zap.onQrImageLoad()}
                                                    onError={() => zap.onQrImageError()}
                                                    style={{
                                                        width: 240,
                                                        height: 240,
                                                        objectFit: 'contain',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 12,
                                                        background: '#fff',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="text-small"
                                                    style={{
                                                        color: 'var(--text-secondary)',
                                                        textAlign: 'center',
                                                        padding: '12px 14px',
                                                        borderRadius: 10,
                                                        border: '1px dashed var(--border)',
                                                        lineHeight: 1.5,
                                                        minHeight: 120,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        maxWidth: 360,
                                                    }}
                                                >
                                                    {zap.waQrError
                                                        ? 'Não foi possível carregar o QR. Use o botão "Gerar novo QR" abaixo ou "Atualizar status".'
                                                        : 'Carregando imagem do QR…'}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                                                {isOwner && zap.waQrLoadFailedOnce && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline"
                                                        style={{ padding: '8px 14px' }}
                                                        onClick={() => zap.refreshWaQrCode()}
                                                        disabled={zap.waLoading || zap.waTokenMissing}
                                                    >
                                                        Gerar novo QR
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ padding: '8px 14px' }}
                                                    onClick={() => void zap.fetchWaInfo()}
                                                    disabled={zap.waLoading || zap.waTokenMissing}
                                                >
                                                    Atualizar status
                                                </button>
                                            </div>
                                        </div>
                                        <div
                                            style={{
                                                padding: '14px 16px',
                                                borderRadius: 10,
                                                borderLeft: '4px solid #25D366',
                                                background: 'var(--surface)',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <p className="text-small" style={{ margin: '0 0 10px', fontWeight: 600, color: 'var(--text)' }}>
                                                No celular
                                            </p>
                                            <ol className="text-small" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                                <li>Abra o WhatsApp</li>
                                                <li>Aparelhos conectados → Conectar um aparelho</li>
                                                <li>Escaneie o código na tela</li>
                                            </ol>
                                            <p className="text-small" style={{ margin: '12px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                Quando terminar no celular, toque em <strong>Atualizar status</strong> aqui para aparecer como conectado.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {zap.connectionError && (
                            <p className="text-small" style={{ color: 'var(--danger)', marginTop: 12 }}>
                                {zap.connectionError}
                            </p>
                        )}

                        {isOwner && (
                            <details style={{ marginTop: 16 }}>
                                <summary className="text-small" style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Ferramentas (dono)
                                </summary>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                    <button type="button" className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={() => void zap.fetchWaInfo()} disabled={zap.waLoading}>
                                        Atualizar status
                                    </button>
                                    {zap.waPersistFailed && (
                                        <button type="button" className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={() => void zap.recoverZapsterInstance()} disabled={zap.waLoading || zap.waTokenMissing}>
                                            Verificar e corrigir
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={() => void zap.reconcileWhatsAppHistory()} disabled={zap.waLoading || zap.waSyncing || zap.waTokenMissing}>
                                        {zap.waSyncing ? 'Sincronizando…' : 'Sincronizar mensagens (24h)'}
                                    </button>
                                    {!!zap.waInfo?.instance_id && zap.waInfo?.status === 'offline' && (
                                        <button type="button" className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={() => void zap.powerOnInstance()} disabled={zap.waLoading || zap.waTokenMissing}>
                                            Ligar instância
                                        </button>
                                    )}
                                    {!!zap.waInfo?.instance_id && (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() =>
                                                    setWaConfirm({
                                                        variant: 'powerOff',
                                                        title: 'Desligar a conexão?',
                                                        description: 'O WhatsApp pode ficar offline até você ligar novamente.',
                                                        confirmLabel: 'Desligar',
                                                    })
                                                }
                                                disabled={zap.waLoading || zap.waTokenMissing}
                                            >
                                                Desligar conexão
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() =>
                                                    setWaConfirm({
                                                        variant: 'restart',
                                                        title: 'Reiniciar a conexão?',
                                                        description: 'Pode levar alguns instantes. Use se o atendimento travou.',
                                                        confirmLabel: 'Reiniciar',
                                                    })
                                                }
                                                disabled={zap.waLoading || zap.waTokenMissing}
                                            >
                                                Reiniciar
                                            </button>
                                        </>
                                    )}
                                </div>
                            </details>
                        )}
                    </>
                )}
            </div>

            {/* Card 2 — Assistente */}
            <div style={card2Style}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Bot size={22} strokeWidth={1.75} color={card2Active ? 'var(--accent, #5b3fbf)' : 'var(--text-secondary)'} aria-hidden />
                    <span className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0, flex: 1 }}>
                        Assistente IA
                    </span>

                    {/* Toggle só aparece quando configurado */}
                    {promptConfigurado && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {iaAtiva ? 'Ligado' : 'Desligado'}
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={iaAtiva}
                                onClick={() => void handleToggleIa(!iaAtiva)}
                                disabled={togglingIa}
                                className={`ai-switch${iaAtiva ? ' ai-switch--on' : ''}${togglingIa ? ' ai-switch--loading' : ''}`}
                                title={iaAtiva ? 'Desativar assistente' : 'Ativar assistente'}
                            >
                                <span className="ai-switch-thumb" />
                            </button>
                        </div>
                    )}
                </div>

                {loadingPrompt ? (
                    <div className="empresa-skeleton-block" style={{ height: 80 }} aria-busy="true" aria-label="Carregando configurações do assistente" />
                ) : (
                    <>
                        {showWizard && (
                            <div style={{ marginTop: 12 }}>
                                <AgenteChatSetup
                                    academyId={String(academyId || '')}
                                    getJwt={getJwt}
                                    wizardInitial={wizardAgenteInitial}
                                    loading={loadingPrompt}
                                    onWizardReset={() => {
                                        setWizardAgenteInitial({ step: 0, answers: {}, savedAt: new Date().toISOString() });
                                        setShowWizard(true);
                                    }}
                                    onComplete={async ({ intro, body, suffix, wizardPayload }) => {
                                        setEditIntro(intro);
                                        setEditBody(body);
                                        setPromptSuffix(suffix);
                                        setWizardAgenteInitial(wizardPayload && typeof wizardPayload === 'object' ? wizardPayload : null);
                                        setShowWizard(false);
                                        setShowEditor(true);
                                    }}
                                />
                            </div>
                        )}

                        {showEditor && <EditorDePrompt />}

                        {showTestChat && <ChatDeTeste />}

                        {!showWizard && !showEditor && !showTestChat && !promptConfigurado && (
                            <div>
                                <span className="text-small" style={{ display: 'inline-block', background: 'var(--border-light)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                    Não configurado
                                </span>
                                <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                                    Configure o assistente para começar a atender leads automaticamente.
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setShowWizard(true);
                                    }}
                                    disabled={!canConfigure}
                                >
                                    Configurar assistente
                                </button>
                            </div>
                        )}

                        {!showWizard && !showEditor && !showTestChat && promptConfigurado && !iaAtiva && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <span className="text-small" style={{ display: 'inline-block', background: 'rgba(37, 211, 102, 0.12)', color: '#15803d', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                            ● Configurado
                                        </span>
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                            {promptUpdatedAt
                                                ? `Atualizado em ${formatInstructionsSavedAt(promptUpdatedAt)}`
                                                : instructionsSavedLabel
                                                    ? `Instruções salvas em ${instructionsSavedLabel}`
                                                    : 'Instruções salvas.'}
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt || savingPrompt}
                                            onClick={() => {
                                                setEditIntro(promptIntro);
                                                setEditBody(promptBody);
                                                setShowEditor(true);
                                            }}
                                        >
                                            Editar prompt
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => setShowTestChat(true)}
                                        >
                                            Testar assistente
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => {
                                                setShowWizard(true);
                                            }}
                                        >
                                            Reconfigurar
                                        </button>
                                    </div>
                                </div>

                                <AdvancedOptionsAccordion />
                            </div>
                        )}

                        {!showWizard && !showEditor && !showTestChat && promptConfigurado && iaAtiva && (
                            <div>
                                {(!zap.waConnected) && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 10,
                                            padding: 12,
                                            borderRadius: 8,
                                            background: 'rgba(245, 158, 11, 0.12)',
                                            border: '1px solid rgba(245, 158, 11, 0.35)',
                                            color: 'var(--text)',
                                            marginBottom: 16
                                        }}
                                    >
                                        <AlertTriangle size={20} style={{ flexShrink: 0, color: '#b45309' }} aria-hidden />
                                        <span className="text-small" style={{ lineHeight: 1.45 }}>
                                            WhatsApp desconectado — o assistente não consegue responder. Conecte o WhatsApp no card acima.
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <span className="text-small" style={{ display: 'inline-block', background: 'rgba(91, 63, 191, 0.12)', color: 'var(--accent, #5b3fbf)', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                            ● Ativo
                                        </span>
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                            Respondendo automaticamente no WhatsApp
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => {
                                                setEditIntro(promptIntro);
                                                setEditBody(promptBody);
                                                setShowEditor(true);
                                            }}
                                        >
                                            Editar prompt
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => setShowTestChat(true)}
                                        >
                                            Testar assistente
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => setShowWizard(true)}
                                        >
                                            Reconfigurar
                                        </button>
                                    </div>
                                </div>

                                {aiThreadsLimit > 0 && aiThreadsUsed >= aiThreadsLimit && !aiOverageEnabled && (
                                    <p className="agent-warning" style={{ marginTop: 14, marginBottom: 0 }}>
                                        Limite de conversas com IA atingido neste ciclo ({aiThreadsUsed}/{aiThreadsLimit}). O atendimento automático pode ficar
                                        indisponível para novas conversas até o próximo ciclo ou até ativar excedente no plano.
                                    </p>
                                )}

                                <AdvancedOptionsAccordion />
                            </div>
                        )}
                    </>
                )}
            </div>

            {waConfirm && (
                <div
                    className="confirm-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="wa-confirm-title"
                    onClick={() => (zap.waLoading ? undefined : setWaConfirm(null))}
                >
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-icon-wrap">
                            <AlertTriangle size={28} color="var(--danger)" aria-hidden />
                        </div>
                        <h3 id="wa-confirm-title" className="navi-section-heading">{waConfirm.title}</h3>
                        <p className="navi-subtitle" style={{ marginTop: 10 }}>{waConfirm.description}</p>
                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                className="btn-outline"
                                style={{ flex: 1 }}
                                onClick={() => setWaConfirm(null)}
                                disabled={zap.waLoading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn-danger"
                                style={{ flex: 1 }}
                                onClick={handleWaConfirmAction}
                                disabled={zap.waLoading}
                            >
                                {waConfirm.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Wizard foi migrado para inline no card (showWizard), sem overlay modal antigo. */}
        </section>
    );
};

export default AgenteIASection;
