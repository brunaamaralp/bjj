import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, Copy } from 'lucide-react';
import { createSessionJwt, teams } from '../../lib/appwrite';
import { parseFaqItems } from '../../../lib/whatsappTemplateDefaults.js';
import { validatePromptFields } from '../../../lib/aiPromptLimits.js';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { canEditAgentPrompt, canViewAgentSettings } from '../../lib/canEditAgentPrompt.js';
import { mapAgentSettingsErrorMessage } from '../../lib/agentTestErrorMessage.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { Smartphone, Bot, AlertTriangle, QrCode, Power, RefreshCw, Unplug, HelpCircle, Check } from 'lucide-react';
import { useTerms, contactLabelSingular } from '../../lib/terminology.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import PageHeader from '../layout/PageHeader.jsx';
import AgentIASidePanel from './AgentIASidePanel.jsx';
import AgentIAPromptEditor from './AgentIAPromptEditor.jsx';
import AgentIATestChat from './AgentIATestChat.jsx';
import AgentIAAdvancedOptions from './AgentIAAdvancedOptions.jsx';
import { isPromptConfigured, formatInstructionsSavedAt, AGENT_SYSTEM_RULES } from './agentIaUtils.js';
import { useToast } from '../../hooks/useToast';
import { formatWaPhoneDisplay } from '../../../lib/zapsterInstancePhone.js';
import { V1_AI_ACTIONS } from '../../../lib/agentActionConfig.js';
import './agent-ia.css';

const AgenteChatSetup = lazy(() => import('../inbox/AgenteChatSetup'));

/** Rótulo curto para o status da conexão WhatsApp na UI do Agente (não conectado). */
function formatWaAgentStatus(status) {
    const k = String(status || '').trim().toLowerCase();
    if (!k) return 'Aguardando conexão';
    if (k === 'connected' || k === 'online') return 'Conectado';
    if (k === 'offline') return 'Conexão pausada';
    if (k === 'open' || k === 'scanning' || k === 'qrcode') return 'Aguardando leitura do QR';
    if (k === 'connecting' || k === 'syncing') return 'Reconectando…';
    if (k === 'disconnected') return 'Desvinculado do WhatsApp';
    if (k === 'unknown') return 'Em verificação';
    if (k === 'error' || k === 'failed') return 'Erro na conexão';
    const words = k.replace(/_/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'Aguardando conexão';
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Ícone + cores para a faixa de status (conexão não ativa). */
function waAgentStatusVisual(status) {
    const k = String(status || '').trim().toLowerCase();
    if (k === 'offline') return { Icon: Power, accent: '#c2410c', bg: 'rgba(194, 65, 12, 0.08)' };
    if (k === 'open' || k === 'scanning' || k === 'qrcode') return { Icon: QrCode, accent: '#25D366', bg: 'rgba(37, 211, 102, 0.08)' };
    if (k === 'connecting' || k === 'syncing') return { Icon: RefreshCw, accent: 'var(--color-primary)', bg: 'rgba(108, 71, 216, 0.08)' };
    if (k === 'disconnected') return { Icon: Unplug, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
    return { Icon: HelpCircle, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
}

function agentDebugEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        const local = String(window.localStorage?.getItem('inbox_debug') || '').trim().toLowerCase();
        if (local === '1' || local === 'true' || local === 'yes') return true;
    } catch {
        void 0;
    }
    return false;
}

function formatWaLastChecked(iso) {
    const s = String(iso || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getAgentPageSubtitle(setupProgress) {
    const { currentStep, waDone, configDone, activeDone } = setupProgress;
    if (waDone && configDone && activeDone) return 'Assistente ativo no WhatsApp.';
    if (currentStep === 1) return 'Passo 1 de 3: conecte o WhatsApp.';
    if (currentStep === 2) return 'Passo 2 de 3: configure o assistente.';
    if (currentStep === 3) return 'Passo 3 de 3: ative o atendimento automático.';
    return 'Defina respostas automáticas no WhatsApp.';
}

const AgenteIASection = ({ academyId, role, academyDoc, showPageHeader = true }) => {
    const terms = useTerms();
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const addToast = useUiStore((s) => s.addToast);
    const toast = useToast();
    const academyIdRef = useRef(academyId);
    useEffect(() => { academyIdRef.current = academyId; }, [academyId]);

    const canViewAgent = canViewAgentSettings(role);
    const userId = useLeadStore((s) => s.userId);
    const [teamMembership, setTeamMembership] = useState(null);
    const canEditPrompt = canEditAgentPrompt(userId, academyDoc, teamMembership);
    const isOwner = role === 'owner';

    useEffect(() => {
        if (!academyDoc?.teamId || !userId) return;
        if (String(academyDoc.ownerId || '') === String(userId)) return;
        teams
            .listMemberships(academyDoc.teamId)
            .then((res) => {
                const m = (res.memberships || []).find((x) => String(x.userId) === String(userId));
                setTeamMembership(m || null);
            })
            .catch(() => setTeamMembership(null));
    }, [academyDoc?.teamId, academyDoc?.ownerId, userId]);

    const zap = useZapsterWhatsAppConnection(academyId, {
        watchAcademyStatus: true,
        onRegisterWebhooksResult: ({ ok }) => {
            if (ok) {
                addToast({ type: 'success', message: 'Agente reativado com sucesso.' });
                return;
            }
            addToast({ type: 'error', message: 'Erro ao reativar agente — tente reconectar.' });
        }
    });

    const shouldLoadWaQr =
        zap.waQrShown &&
        !zap.waConnected &&
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
    // zap inteiro é instável; métodos e instance_id já cobrem o fetch de QR.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- QR keyed on instance_id/tick + stable zap methods
    }, [
        shouldLoadWaQr,
        zap.waInfo?.instance_id,
        zap.waQrTick,
        zap.fetchQrCode,
        zap.onQrImageError,
    ]);

    useEffect(() => {
        if (!academyId) return;
        if (!zap.waConnected) return;
        const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
        if (done) return;
        void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
    }, [zap.waConnected, academyId]);

    useEffect(() => {
        if (waLoadingPrevRef.current && !zap.waLoading && academyId) {
            setWaLastCheckedAt(new Date().toISOString());
        }
        waLoadingPrevRef.current = zap.waLoading;
    }, [zap.waLoading, academyId]);

    const [promptIntro, setPromptIntro] = useState('');
    const [promptBody, setPromptBody] = useState('');
    const [promptSuffix, setPromptSuffix] = useState('');
    const [, setPromptSavedSnapshot] = useState({ intro: '', body: '', suffix: '' });
    const [loadingPrompt, setLoadingPrompt] = useState(false);
    const [settingsLoadError, setSettingsLoadError] = useState('');
    const loadSettingsRunRef = useRef(0);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [iaAtiva, setIaAtiva] = useState(false);
    const [togglingIa, setTogglingIa] = useState(false);
    const [birthdayMessage, setBirthdayMessage] = useState('');
    const [savingBirthdayMessage, setSavingBirthdayMessage] = useState(false);
    const [faqItems, setFaqItems] = useState([]);
    const [savingFaq, setSavingFaq] = useState(false);
    const [aiActionsEnabled, setAiActionsEnabled] = useState(true);
    const [aiActionsSelected, setAiActionsSelected] = useState(() => new Set(V1_AI_ACTIONS));
    const [conversationTimelineEnabled, setConversationTimelineEnabled] = useState(true);
    const [savingAiActions, setSavingAiActions] = useState(false);
    const [aiModuleEnabled, setAiModuleEnabled] = useState(true);
    const [savingAiModule, setSavingAiModule] = useState(false);
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
    const [waLastCheckedAt, setWaLastCheckedAt] = useState('');
    const waLoadingPrevRef = useRef(false);

    // Fluxo do card Assistente IA (sequencial)
    const [showWizard, setShowWizard] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [showTestChat, setShowTestChat] = useState(false);

    // Editor de prompt (intro/body editáveis)
    const [editIntro, setEditIntro] = useState('');
    const [editBody, setEditBody] = useState('');
    const [promptIntroBackup, setPromptIntroBackup] = useState('');
    const [promptBodyBackup, setPromptBodyBackup] = useState('');
    const [promptSuffixBackup, setPromptSuffixBackup] = useState('');
    const [promptUpdatedAt, setPromptUpdatedAt] = useState('');
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [showReconfigureConfirm, setShowReconfigureConfirm] = useState(false);

    useEffect(() => {
        setShowWizard(false);
        setShowEditor(false);
        setShowTestChat(false);
        setShowRestoreModal(false);
        setEditIntro('');
        setEditBody('');
        setWizardAgenteInitial(null);
    }, [academyId]);

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
        // Fecha o modal antes de qualquer await (ex.: 402 em DELETE dispara redirect com atraso).
        flushSync(() => {
            setWaConfirm(null);
        });
        if (variant === 'disconnect') void zap.disconnectWaInstance();
        if (variant === 'powerOff') void zap.powerOffInstance();
        if (variant === 'restart') void zap.restartInstance();
    };

    const instructionsSavedLabel = useMemo(
        () => formatInstructionsSavedAt(wizardAgenteInitial?.savedAt),
        [wizardAgenteInitial?.savedAt]
    );

    const loadPromptSettings = useCallback(async () => {
        if (!academyId || !canViewAgent) return;
        const runId = ++loadSettingsRunRef.current;
        setSettingsLoadError('');
        setLoadingPrompt(true);
        try {
            const jwt = await createSessionJwt();
            const aid = String(academyId || '').trim();
            if (!aid) return;
            const headers = { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid };
            const rPrompt = await fetchWithBillingGuard('/api/settings/ai-prompt', { headers });
            if (runId !== loadSettingsRunRef.current) return;
            if (rPrompt.blocked) return;

            const data = await rPrompt.res.json();
            if (runId !== loadSettingsRunRef.current) return;
            if (rPrompt.res.ok && data && typeof data === 'object') {
                const intro = String(data.prompt_intro || '');
                const body = String(data.prompt_body || '');
                const suffix = String(data.prompt_suffix || '');
                const snap = data.prompt_backup_snapshot;
                const introBackup = String(snap?.intro || data.prompt_intro_backup || '');
                const bodyBackup = String(snap?.body || data.prompt_body_backup || '');
                const suffixBackup = String(snap?.suffix ?? data.prompt_suffix_backup ?? '');
                const updatedAt = String(data.prompt_updated_at || '');
                setPromptIntro(intro);
                setPromptBody(body);
                setPromptSuffix(suffix);
                setPromptSavedSnapshot({ intro, body, suffix });
                setPromptConfigurado(isPromptConfigured(intro, body));

                setPromptIntroBackup(introBackup);
                setPromptBodyBackup(bodyBackup);
                setPromptSuffixBackup(suffixBackup);
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
                if (data.ai_actions && typeof data.ai_actions === 'object') {
                    setAiActionsEnabled(data.ai_actions.enabled !== false);
                    const acts = Array.isArray(data.ai_actions.actions) ? data.ai_actions.actions : V1_AI_ACTIONS;
                    setAiActionsSelected(new Set(acts.filter((a) => V1_AI_ACTIONS.includes(a))));
                    setConversationTimelineEnabled(data.ai_actions.conversation_timeline?.enabled !== false);
                } else {
                    setAiActionsEnabled(true);
                    setAiActionsSelected(new Set(V1_AI_ACTIONS));
                    setConversationTimelineEnabled(true);
                }
                const aiMod = data.ai_module && typeof data.ai_module === 'object' ? data.ai_module : null;
                const modEnabled = aiMod ? aiMod.enabled !== false : true;
                setAiModuleEnabled(modEnabled);
                useLeadStore.getState().setModules({ aiEnabled: modEnabled });
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
                throw new Error(mapAgentSettingsErrorMessage({ status: rPrompt.res.status, erro: 'Falha ao carregar' }));
            }
        } catch (e) {
            if (runId !== loadSettingsRunRef.current) return;
            setSettingsLoadError(
                mapAgentSettingsErrorMessage({
                    message: e?.message,
                    network: !e?.message?.includes('suporte'),
                })
            );
        } finally {
            if (runId === loadSettingsRunRef.current) setLoadingPrompt(false);
        }
    }, [academyId, canViewAgent]);

    useEffect(() => {
        void loadPromptSettings();
    }, [loadPromptSettings]);

    useEffect(() => {
        if (!canEditPrompt || !promptConfigurado || !academyId) return;
        const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done;
        if (done) return;
        void useLeadStore.getState().completeOnboardingStepIds(['setup_ai']);
    }, [canEditPrompt, promptConfigurado, academyId]);

    useEffect(() => {
        // Mantém o nome da academia sincronizado se o props vier atualizado.
        setAcademyName(String(academyDoc?.name || '').trim());
    }, [academyDoc?.name]);

    async function savePromptSettings(overrides, { successMessage } = {}) {
        if (!canEditPrompt) return false;
        const use = overrides && typeof overrides === 'object' ? overrides : null;
        const intro = use && 'prompt_intro' in use ? String(use.prompt_intro) : String(promptIntro || '');
        const bodyPut = use && 'prompt_body' in use ? String(use.prompt_body) : String(promptBody || '');
        const suffixPut = use && 'prompt_suffix' in use ? String(use.prompt_suffix) : String(promptSuffix || '');
        setSavingPrompt(true);
        try {
            const prevIntro = String(promptIntro || '');
            const prevBody = String(promptBody || '');
            const jwt = await createSessionJwt();
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
            if (!resp.ok) {
                throw new Error(mapAgentSettingsErrorMessage({ status: resp.status, erro: raw || 'Falha ao salvar' }));
            }
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
            addToast({
                type: 'error',
                message: mapAgentSettingsErrorMessage({ message: e?.message, network: true }),
            });
            return false;
        } finally {
            setSavingPrompt(false);
        }
    }

    async function handleToggleIa(nextActive) {
        const debugOn = agentDebugEnabled();
        if (!canEditPrompt || !promptConfigurado || togglingIa || !aiModuleEnabled) return false;
        const target = typeof nextActive === 'boolean' ? nextActive : !iaAtiva;
        if (target === iaAtiva) return true;
        setTogglingIa(true);
        try {
            const jwt = await createSessionJwt();
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
            if (debugOn) {
                console.log('[AI Agent Debug] toggle response', {
                    target,
                    status: resp.status,
                    blocked,
                    success: Boolean(data?.sucesso),
                    iaAtiva: data?.ia_ativa
                });
            }
            if (data?.sucesso) {
                setIaAtiva(data.ia_ativa === true);
                return true;
            }
            const errMsg =
                data?.code === 'prompt_nao_configurado'
                    ? 'Conclua a configuração guiada do assistente (Identidade e Conhecimento) antes de ativar.'
                    : data?.erro || 'Não foi possível atualizar a IA';
            addToast({ type: 'error', message: errMsg });
            return false;
        } catch (e) {
            if (debugOn) {
                console.error('[AI Agent Debug] toggle exception', e);
            }
            addToast({ type: 'error', message: friendlyError(e, 'save') });
            return false;
        } finally {
            setTogglingIa(false);
        }
    }

    async function handleSaveBirthdayMessage() {
        if (savingBirthdayMessage) return;
        setSavingBirthdayMessage(true);
        try {
            const jwt = await createSessionJwt();
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
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSavingBirthdayMessage(false);
        }
    }

    async function handleToggleAiModule(nextEnabled) {
        if (!canEditPrompt || savingAiModule) return false;
        const target = typeof nextEnabled === 'boolean' ? nextEnabled : !aiModuleEnabled;
        if (target === aiModuleEnabled) return true;
        setSavingAiModule(true);
        try {
            const jwt = await createSessionJwt();
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || ''),
                },
                body: JSON.stringify({ action: 'save_ai_module', enabled: target }),
            });
            if (blocked) return false;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) {
                const enabled = data.ai_module?.enabled !== false;
                setAiModuleEnabled(enabled);
                useLeadStore.getState().setModules({ aiEnabled: enabled });
                if (!enabled) {
                    setIaAtiva(false);
                } else if (data.ia_ativa === true) {
                    setIaAtiva(true);
                }
                addToast({
                    type: 'success',
                    message: enabled ? 'Recursos de IA ativados' : 'Recursos de IA desativados',
                });
                return true;
            }
            addToast({ type: 'error', message: data?.erro || 'Não foi possível salvar' });
            return false;
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
            return false;
        } finally {
            setSavingAiModule(false);
        }
    }

    async function handleSaveAiActions() {
        if (savingAiActions) return;
        setSavingAiActions(true);
        try {
            const jwt = await createSessionJwt();
            const actions = V1_AI_ACTIONS.filter((a) => aiActionsSelected.has(a));
            const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                    'x-academy-id': String(academyIdRef.current || ''),
                },
                body: JSON.stringify({
                    action: 'save_ai_actions',
                    enabled: aiActionsEnabled,
                    actions: actions.length > 0 ? actions : V1_AI_ACTIONS,
                    conversation_timeline: { enabled: conversationTimelineEnabled },
                }),
            });
            if (blocked) return;
            const data = await resp.json().catch(() => ({}));
            if (data?.sucesso) {
                const cfg = data.ai_actions || {};
                setAiActionsEnabled(cfg.enabled !== false);
                const acts = Array.isArray(cfg.actions) ? cfg.actions : V1_AI_ACTIONS;
                setAiActionsSelected(new Set(acts.filter((a) => V1_AI_ACTIONS.includes(a))));
                setConversationTimelineEnabled(cfg.conversation_timeline?.enabled !== false);
                addToast({ type: 'success', message: 'Ações automáticas salvas' });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Não foi possível salvar' });
            }
        } catch (e) {
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSavingAiActions(false);
        }
    }

    function toggleAiAction(action, checked) {
        setAiActionsSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(action);
            else next.delete(action);
            return next;
        });
    }

    async function handleSaveFaqData() {
        if (savingFaq) return;
        setSavingFaq(true);
        try {
            const jwt = await createSessionJwt();
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
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        } finally {
            setSavingFaq(false);
        }
    }

    async function handlePreviewFullPrompt() {
        if (loadingPromptPreview) return;
        setLoadingPromptPreview(true);
        try {
            const jwt = await createSessionJwt();
            const resp = await fetch('/api/settings/prompt-preview', {
                headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data?.sucesso) {
                throw new Error(
                    mapAgentSettingsErrorMessage({ status: resp.status, erro: data?.erro || 'Não foi possível carregar a prévia' })
                );
            }
            setPromptPreviewText(String(data.prompt || ''));
            setShowPromptPreview(true);
        } catch (e) {
            addToast({
                type: 'error',
                message: mapAgentSettingsErrorMessage({ message: e?.message, network: true }),
            });
        } finally {
            setLoadingPromptPreview(false);
        }
    }

    const openManualEditor = useCallback(() => {
        setEditIntro(promptIntro);
        setEditBody(promptBody);
        if (!String(promptSuffix || '').trim()) {
            setPromptSuffix(AGENT_SYSTEM_RULES);
        }
        setShowWizard(false);
        setShowTestChat(false);
        setShowEditor(true);
    }, [promptIntro, promptBody, promptSuffix]);

    const handleEditorCancel = () => {
        setShowEditor(false);
        setShowWizard(false);
        setShowTestChat(false);
    };

    const handleEditorSaveAndTest = async () => {
        const fieldCheck = validatePromptFields(editIntro, editBody);
        if (!fieldCheck.ok) {
            addToast({ type: 'error', message: fieldCheck.erro });
            return;
        }
        const suffixToSave = String(promptSuffix || '').trim() || AGENT_SYSTEM_RULES;
        const ok = await savePromptSettings(
            { prompt_intro: editIntro, prompt_body: editBody, prompt_suffix: suffixToSave },
            { successMessage: 'Instruções do assistente atualizadas com sucesso!' }
        );
        if (!ok) return;
        setShowEditor(false);
        setShowWizard(false);
        setShowTestChat(true);
    };

    const handleEditorConfirmRestore = async () => {
        const ok = await savePromptSettings(
            {
                prompt_intro: promptIntroBackup,
                prompt_body: promptBodyBackup,
                prompt_suffix: promptSuffixBackup || promptSuffix,
            },
            { successMessage: 'Versão anterior restaurada e salva.' }
        );
        if (!ok) return;
        setEditIntro(promptIntroBackup);
        setEditBody(promptBodyBackup);
        setShowRestoreModal(false);
        setShowEditor(false);
    };

    const handleTestChatActivated = () => {
        setShowTestChat(false);
        setShowEditor(false);
        setShowWizard(false);
    };

    const waStatusVisual = useMemo(() => waAgentStatusVisual(zap.waStatus), [zap.waStatus]);
    const WaStatusIcon = waStatusVisual.Icon;

    const card1Connected = zap.waConnected;
    const card2Active = promptConfigurado && iaAtiva;

    const setupProgress = useMemo(() => {
        const waDone = card1Connected;
        const configDone = promptConfigurado;
        const activeDone = iaAtiva;
        let currentStep = 1;
        if (waDone && !configDone) currentStep = 2;
        else if (waDone && configDone && !activeDone) currentStep = 3;
        else if (waDone && configDone && activeDone) currentStep = 0;
        let statusLine = '';
        if (waDone && configDone && !activeDone) {
            statusLine = 'Conectado, mas atendimento pausado';
        }
        return { waDone, configDone, activeDone, currentStep, statusLine };
    }, [card1Connected, promptConfigurado, iaAtiva]);

    const focusWa = setupProgress.currentStep === 1;
    const focusAssistant = setupProgress.currentStep === 2 || setupProgress.currentStep === 3;

    const card1Class = [
        'agent-ia-card',
        card1Connected ? 'agent-ia-card--wa-connected' : '',
        focusWa ? 'agent-ia-card--focus' : '',
        focusAssistant && card1Connected ? 'agent-ia-card--compact' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const card2Class = [
        'agent-ia-card',
        card2Active ? 'agent-ia-card--assistant-active' : '',
        focusAssistant ? 'agent-ia-card--focus' : '',
        focusWa ? 'agent-ia-card--deferred' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const pageSubtitle = getAgentPageSubtitle(setupProgress);

    const pageMeta =
        aiThreadsLimit > 0 ? (
            <>
                Conversas com assistente neste ciclo: <strong>{aiThreadsUsed}</strong> de <strong>{aiThreadsLimit}</strong>
                {aiThreadsUsed >= aiThreadsLimit && !aiOverageEnabled ? (
                    <span> — limite atingido; mensagens extras no plano podem ser necessárias.</span>
                ) : null}
            </>
        ) : null;

    const handleCopyConfigLink = useCallback(async () => {
        const url = typeof window !== 'undefined' ? `${window.location.origin}/agente-ia` : '/agente-ia';
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copiado. Envie ao dono da academia.');
        } catch {
            toast.error('Não foi possível copiar o link.');
        }
    }, [toast]);

    const renderWaRefreshButton = (extraStyle = {}) => (
        <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '8px 14px', ...extraStyle }}
            onClick={() => void zap.fetchWaInfo()}
            disabled={zap.waLoading || zap.waTokenMissing}
        >
            Atualizar status
        </button>
    );

    const renderWaBanners = () => (
        <>
            {zap.waTokenMissing ? (
                <StatusBanner
                    variant="error"
                    message="Integração não finalizada — fale com o suporte para concluir a conexão com o WhatsApp."
                />
            ) : null}
            {zap.waPersistFailed && isOwner ? (
                <StatusBanner
                    variant="warning"
                    message="A conexão foi criada, mas não foi possível salvar no sistema."
                    action={{
                        label: 'Corrigir automaticamente',
                        onClick: () => void zap.recoverZapsterInstance(),
                    }}
                />
            ) : null}
            {zap.connectionError && !zap.waTokenMissing ? (
                <StatusBanner
                    variant="error"
                    message={zap.connectionError}
                    onRetry={() => void zap.fetchWaInfo()}
                    retryLabel="Tentar novamente"
                />
            ) : null}
        </>
    );

    const renderWaConnectedSummary = () => {
        const waPhoneDisplay = formatWaPhoneDisplay(zap.waInfo?.phone);
        return (
        <div className="agent-ia-connected-summary">
            <div className="agent-ia-connected-summary__row">
                <span className="agent-ia-connected-summary__status">
                    <Check size={16} strokeWidth={2.5} aria-hidden />
                    WhatsApp conectado
                </span>
                {renderWaRefreshButton()}
            </div>
            {waPhoneDisplay ? (
                <p className="agent-ia-connected-summary__meta">
                    Número conectado: <strong>{waPhoneDisplay}</strong>
                </p>
            ) : null}
            {waLastCheckedAt ? (
                <p className="agent-ia-connected-summary__meta">
                    Status verificado em {formatWaLastChecked(waLastCheckedAt)}.
                    {zap.waLoading ? ' Atualizando…' : null}
                </p>
            ) : null}
            <Link to="/inbox" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '8px 14px' }}>
                Ver conversas
            </Link>
        </div>
        );
    };

    const renderActivateCta = () => {
        if (!promptConfigurado || iaAtiva || !canEditPrompt) return null;
        if (showWizard || showEditor || showTestChat) return null;
        return (
            <div className="agent-ia-activate-cta">
                <p className="agent-ia-activate-cta__hint">
                    Último passo: ative para o assistente responder automaticamente no WhatsApp.
                </p>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleToggleIa(true)}
                    disabled={togglingIa || !zap.waConnected}
                >
                    {togglingIa ? 'Ativando…' : 'Ativar atendimento automático'}
                </button>
                {!zap.waConnected ? (
                    <p className="text-small" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Conecte o WhatsApp no card acima antes de ativar.
                    </p>
                ) : null}
            </div>
        );
    };

    const openReconfigureWizard = () => {
        setShowReconfigureConfirm(false);
        setShowWizard(true);
        setShowEditor(false);
        setShowTestChat(false);
    };

    const renderOwnerMaintenance = () => {
        if (!isOwner) return null;
        return (
            <details className="agent-ia-maintenance">
                <summary className="agent-ia-maintenance__summary">Precisa de ajuda com a conexão? →</summary>
                <div className="agent-ia-maintenance__body">
                    <div className="agent-ia-maintenance__group">
                        <p className="agent-ia-maintenance__group-title">Corrigir problemas</p>
                        <div className="agent-ia-maintenance__actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '6px 10px' }}
                                onClick={() => void zap.recoverZapsterInstance()}
                                disabled={zap.waLoading || zap.waTokenMissing}
                            >
                                Corrigir conexão automaticamente
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '6px 10px' }}
                                onClick={() => void zap.reconcileWhatsAppHistory()}
                                disabled={zap.waLoading || zap.waSyncing || zap.waTokenMissing}
                            >
                                {zap.waSyncing ? 'Buscando…' : 'Buscar mensagens recentes'}
                            </button>
                        </div>
                    </div>
                    {!!zap.waInfo?.instance_id && (
                        <div className="agent-ia-maintenance__group">
                            <p className="agent-ia-maintenance__group-title">Ações avançadas</p>
                            <div className="agent-ia-maintenance__actions">
                                {zap.waInfo?.status === 'offline' && (
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        style={{ padding: '6px 10px' }}
                                        onClick={() => void zap.powerOnInstance()}
                                        disabled={zap.waLoading || zap.waTokenMissing}
                                    >
                                        Conectar WhatsApp
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ padding: '6px 10px' }}
                                    onClick={() =>
                                        setWaConfirm({
                                            variant: 'powerOff',
                                            title: 'Pausar conexão?',
                                            description: 'O WhatsApp pode ficar offline até você retomar a conexão.',
                                            confirmLabel: 'Pausar conexão',
                                        })
                                    }
                                    disabled={zap.waLoading || zap.waTokenMissing}
                                >
                                    Pausar conexão
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
                                            confirmLabel: 'Reiniciar conexão',
                                        })
                                    }
                                    disabled={zap.waLoading || zap.waTokenMissing}
                                >
                                    Reiniciar conexão
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    style={{ padding: '6px 10px' }}
                                    onClick={() =>
                                        setWaConfirm({
                                            variant: 'disconnect',
                                            title: 'Remover conexão WhatsApp?',
                                            description: 'O assistente para de responder até você conectar novamente.',
                                            confirmLabel: 'Remover conexão',
                                        })
                                    }
                                    disabled={zap.waLoading || zap.waTokenMissing}
                                >
                                    Remover conexão WhatsApp
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </details>
        );
    };

    const closeAgentSidePanel = useCallback(() => {
        setShowWizard(false);
        setShowEditor(false);
        setShowTestChat(false);
    }, []);

    const agentSidePanelOpen =
        showTestChat || (showEditor && canEditPrompt) || (showWizard && canEditPrompt);

    const agentSidePanelMeta = useMemo(() => {
        if (showTestChat) {
            return {
                title: 'Chat de teste',
                subtitle: 'Mensagens não são enviadas a contatos reais.',
                wide: true,
            };
        }
        if (showEditor && canEditPrompt) {
            return {
                title: 'Editar instruções',
                subtitle: 'Identidade, conhecimento e regras do assistente.',
                wide: true,
            };
        }
        if (showWizard && canEditPrompt) {
            return {
                title: 'Configuração guiada',
                subtitle: 'Responda no seu ritmo — as instruções são geradas ao final.',
                wide: true,
            };
        }
        return null;
    }, [showTestChat, showEditor, showWizard, canEditPrompt]);

    const sidePanelFallback = (
        <div
            className="empresa-skeleton-block agent-ia-side-panel-fallback"
            aria-busy="true"
            aria-label="Carregando painel de configuração"
        />
    );

    const renderAgentSidePanelBody = () => {
        if (showWizard && canEditPrompt) {
            return (
                <Suspense fallback={sidePanelFallback}>
                    <AgenteChatSetup
                        academyId={String(academyId || '')}
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
                </Suspense>
            );
        }
        if (showEditor && canEditPrompt) {
            return (
                <AgentIAPromptEditor
                    editIntro={editIntro}
                    onEditIntroChange={setEditIntro}
                    editBody={editBody}
                    onEditBodyChange={setEditBody}
                    promptSuffix={promptSuffix}
                    promptIntroBackup={promptIntroBackup}
                    promptBodyBackup={promptBodyBackup}
                    promptUpdatedAt={promptUpdatedAt}
                    savingPrompt={savingPrompt}
                    canEditPrompt={canEditPrompt}
                    onSaveAndTest={handleEditorSaveAndTest}
                    onCancel={handleEditorCancel}
                    onRestore={() => setShowRestoreModal(true)}
                    showRestoreModal={showRestoreModal}
                    onCloseRestoreModal={() => setShowRestoreModal(false)}
                    onConfirmRestore={handleEditorConfirmRestore}
                />
            );
        }
        if (showTestChat) {
            return (
                <AgentIATestChat
                    academyId={academyId}
                    aiName={aiName}
                    academyName={academyName}
                    workspaceNoun={terms.workspaceNoun}
                    contactLabel={contactLabel}
                    testMessagesToday={testMessagesToday}
                    testMessagesResetDate={testMessagesResetDate}
                    onTestsUsageUpdate={(used, date) => {
                        setTestMessagesToday(used);
                        setTestMessagesResetDate(date);
                    }}
                    onToggleIa={handleToggleIa}
                    togglingIa={togglingIa}
                    onClose={() => setShowTestChat(false)}
                    onActivated={handleTestChatActivated}
                    addToast={addToast}
                />
            );
        }
        return null;
    };

    const renderAgentSidePanelHint = () => {
        if (!agentSidePanelOpen) return null;
        return (
            <div className="agent-ia-sheet-inline-hint" role="status">
                <p>A configuração continua no painel lateral. Feche o painel para ver o resumo aqui.</p>
                <button type="button" className="btn btn-outline btn-sm" onClick={closeAgentSidePanel}>
                    Fechar painel
                </button>
            </div>
        );
    };

    const pageHeaderPrefix = showPageHeader ? (
        <Link
            to="/inbox"
            className="edit-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
        >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            Voltar para conversas
        </Link>
    ) : null;

    if (!canViewAgent) {
        return (
            <>
                {showPageHeader ? (
                    <PageHeader
                        title="Agente de atendimento"
                        subtitle="Defina respostas automáticas no WhatsApp."
                        prefix={pageHeaderPrefix}
                    />
                ) : null}
                <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                        Você não tem permissão para acessar o Agente de Atendimento nesta academia.
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            {showPageHeader ? (
                <PageHeader
                    title="Agente de atendimento"
                    subtitle={pageSubtitle}
                    meta={pageMeta}
                    prefix={pageHeaderPrefix}
                />
            ) : null}
            <section className="empresa-section animate-in" style={{ animationDelay: '0.05s', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {settingsLoadError ? (
                <StatusBanner
                    variant="error"
                    message={settingsLoadError}
                    onRetry={() => void loadPromptSettings()}
                    retryLabel="Tentar novamente"
                />
            ) : null}
            <div className="agent-ia-setup-panel" role="region" aria-label="Progresso da configuração">
                <div className="agent-ia-setup-steps">
                    {[
                        { n: 1, label: 'Conectar WhatsApp', done: setupProgress.waDone },
                        { n: 2, label: 'Configurar assistente', done: setupProgress.configDone },
                        { n: 3, label: 'Ativar', done: setupProgress.activeDone },
                    ].map((step) => (
                        <div
                            key={step.n}
                            className={[
                                'agent-ia-setup-step',
                                step.done ? 'agent-ia-setup-step--done' : '',
                                setupProgress.currentStep === step.n ? 'agent-ia-setup-step--current' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <span className="agent-ia-setup-step__icon" aria-hidden>
                                {step.done ? <Check size={14} strokeWidth={2.5} /> : step.n}
                            </span>
                            <span className="agent-ia-setup-step__label">{step.label}</span>
                        </div>
                    ))}
                </div>
                {setupProgress.statusLine ? (
                    <p className="agent-ia-setup-panel__status">{setupProgress.statusLine}</p>
                ) : null}
            </div>

            {/* Card 1 — WhatsApp */}
            <div className={card1Class}>
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

                <div className="agent-ia-section-banners">{renderWaBanners()}</div>

                {card1Connected ? (
                    renderWaConnectedSummary()
                ) : (
                    <>
                        {!isOwner && (
                            <div
                                className="agent-ia-member-wa-hint"
                                role="note"
                                style={{
                                    margin: '0 0 16px',
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.85rem',
                                    lineHeight: 1.5,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <p style={{ margin: '0 0 10px' }}>Peça ao dono da academia para conectar o WhatsApp.</p>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    onClick={() => void handleCopyConfigLink()}
                                >
                                    <Copy size={14} aria-hidden />
                                    Copiar link desta página
                                </button>
                            </div>
                        )}

                        {!zap.waInfo?.instance_id && (
                            <div style={{ textAlign: 'center', padding: '8px 0 16px', maxWidth: 420, margin: '0 auto' }}>
                                <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text)' }}>Primeiro passo</p>
                                <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.55 }}>
                                    {isOwner
                                        ? `Conecte o WhatsApp desta ${terms.workspaceNoun}. Na sequência você poderá exibir o código QR para escanear no celular.`
                                        : 'Somente o dono da academia pode iniciar a conexão nesta página.'}
                                </p>
                                {isOwner && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => void zap.createWaInstance()}
                                        disabled={zap.waLoading || zap.waTokenMissing || zap.isCreating}
                                    >
                                        {zap.waLoading || zap.isCreating ? 'Aguarde…' : 'Conectar WhatsApp'}
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
                                        {formatWaAgentStatus(zap.waStatus)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>{renderWaRefreshButton()}</div>

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
                                            Conectar pelo celular (QR Code)
                                        </p>
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.55 }}>
                                            {isOwner ? (
                                                <>
                                                    {String(zap.waStatus || '').trim().toLowerCase() === 'offline' ? (
                                                        <>
                                                            A conexão está <strong>pausada</strong>. Toque em <strong>Exibir código QR</strong> — o sistema
                                                            religa a instância e prepara o pareamento (pode levar até ~15 s). Se não aparecer, use{' '}
                                                            <strong>Reiniciar conexão</strong> em &quot;Precisa de ajuda?&quot; abaixo.
                                                        </>
                                                    ) : (
                                                        <>
                                                            No celular, abra o <strong>WhatsApp</strong> → menu (três pontos ou configurações) →{' '}
                                                            <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>. Depois toque em{' '}
                                                            <strong>Exibir código QR</strong> aqui e aponte a câmera para a tela.
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <>Somente o dono da academia pode abrir o código QR nesta página. Use o botão acima para ver se a conexão já foi feita.</>
                                            )}
                                        </p>
                                        {isOwner ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    onClick={() => void zap.revealWaQrCode()}
                                                    disabled={zap.waLoading || zap.waTokenMissing}
                                                >
                                                    {zap.waLoading ? 'Preparando QR…' : 'Exibir código QR'}
                                                </button>
                                            </div>
                                        ) : null}
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
                                                    {zap.waConnected
                                                        ? 'WhatsApp já conectado. Não há QR disponível no momento.'
                                                        : zap.waQrError
                                                            ? 'Não foi possível carregar o QR (a instância pode estar pausada). Use "Gerar novo QR" ou "Reiniciar conexão" em Precisa de ajuda?'
                                                            : zap.waLoading
                                                              ? 'Preparando instância e QR… aguarde alguns segundos.'
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
                                                Depois de escanear no celular, o status atualiza sozinho em alguns segundos. Se não mudar, use{' '}
                                                <strong>Atualizar status</strong>.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                    </>
                )}
            </div>

            {renderOwnerMaintenance()}

            {/* Card 2 — Assistente */}
            <div className={card2Class}>
                {focusWa ? (
                    <p className="agent-ia-deferred-hint" role="note">
                        Disponível após conectar o WhatsApp — conclua o passo 1 acima primeiro.
                    </p>
                ) : null}
                <p className="agent-ia-config-banner" role="note">
                    Ambiente de configuração — nada aqui vai para alunos até ativar e conectar WhatsApp.
                </p>
                {canEditPrompt ? (
                    <div
                        className="agent-ia-master-toggle"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 14,
                            flexWrap: 'wrap',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid var(--border-light, #e8e8ef)',
                            background: 'var(--surface-subtle, #fafafa)',
                        }}
                    >
                        <span className="text-small" style={{ flex: 1, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Recursos de IA (barra ⌘K, copilot, imports assistidos, sandbox)
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={aiModuleEnabled}
                            onClick={() => void handleToggleAiModule(!aiModuleEnabled)}
                            disabled={savingAiModule}
                            className={`ai-switch${aiModuleEnabled ? ' ai-switch--on' : ''}${savingAiModule ? ' ai-switch--loading' : ''}`}
                            title={aiModuleEnabled ? 'Desativar recursos de IA' : 'Ativar recursos de IA'}
                        >
                            <span className="ai-switch-thumb" aria-hidden />
                        </button>
                    </div>
                ) : null}
                {!aiModuleEnabled ? (
                    <p className="agent-ia-readonly-banner" role="note">
                        Recursos de IA desativados para esta academia. Ative acima para usar assistente, copilot e comandos naturais.
                    </p>
                ) : null}
                {!canEditPrompt && (
                    <p className="agent-ia-readonly-banner" role="note">
                        Você pode testar o assistente, mas só o dono da academia ou administrador pode editar as instruções.
                    </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Bot size={22} strokeWidth={1.75} color={card2Active ? 'var(--accent, var(--petroleo))' : 'var(--text-secondary)'} aria-hidden />
                    <span className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0, flex: 1 }}>
                        Agente de Atendimento
                    </span>

                    {canEditPrompt ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            {!promptConfigurado ? (
                                <p id="agent-ia-toggle-hint" className="agent-ia-toggle-hint" role="note">
                                    Preencha as instruções (guiadas ou editando o texto) antes de ativar o atendimento automático.
                                </p>
                            ) : !aiModuleEnabled ? (
                                <p id="agent-ia-toggle-hint" className="agent-ia-toggle-hint" role="note">
                                    Ative os recursos de IA acima para ligar o atendimento automático.
                                </p>
                            ) : null}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {iaAtiva ? 'Atendimento automático ativo' : 'Atendimento automático pausado'}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={iaAtiva}
                                    aria-describedby={
                                        !promptConfigurado || !aiModuleEnabled ? 'agent-ia-toggle-hint' : undefined
                                    }
                                    onClick={() => void handleToggleIa(!iaAtiva)}
                                    disabled={togglingIa || !promptConfigurado || !aiModuleEnabled}
                                    className={`ai-switch${iaAtiva ? ' ai-switch--on' : ''}${togglingIa ? ' ai-switch--loading' : ''}`}
                                    title={
                                        !promptConfigurado
                                            ? 'Configure o assistente primeiro'
                                            : !aiModuleEnabled
                                              ? 'Ative os recursos de IA primeiro'
                                              : iaAtiva
                                                ? 'Pausar atendimento automático'
                                                : 'Ativar atendimento automático'
                                    }
                                >
                                    <span className="ai-switch-thumb" />
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>

                {loadingPrompt ? (
                    <div className="empresa-skeleton-block" style={{ height: 80 }} aria-busy="true" aria-label="Carregando configurações do assistente" />
                ) : (
                    <>
                        {renderAgentSidePanelHint()}

                        {!agentSidePanelOpen && !promptConfigurado && (
                            <div>
                                <span className="text-small" style={{ display: 'inline-block', background: 'var(--border-light)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                    Não configurado
                                </span>
                                <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                                    Configure o assistente para começar a atender contatos automaticamente — pelo passo a passo ou
                                    escrevendo as instruções você mesmo.
                                </p>
                                <div className="agent-ia-setup-actions">
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setShowEditor(false);
                                            setShowTestChat(false);
                                            setShowWizard(true);
                                        }}
                                        disabled={!canEditPrompt}
                                    >
                                        Iniciar configuração guiada
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={openManualEditor}
                                        disabled={!canEditPrompt || loadingPrompt}
                                    >
                                        Editar instruções diretamente
                                    </button>
                                </div>
                                <p className="text-small agent-ia-setup-actions__hint">
                                    No editor direto você define identidade, conhecimento e salva para testar ou ativar.
                                </p>
                            </div>
                        )}

                        {!agentSidePanelOpen && promptConfigurado && !iaAtiva && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <span className="text-small" style={{ display: 'inline-block', background: 'rgba(37, 211, 102, 0.12)', color: '#15803d', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                            ● Pronto — ative para começar a atender
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
                                        {canEditPrompt && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ padding: '6px 12px', minHeight: 34 }}
                                                    disabled={loadingPrompt || savingPrompt}
                                                    onClick={openManualEditor}
                                                >
                                                    Editar manualmente
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                                    disabled={loadingPrompt}
                                                    onClick={() => setShowReconfigureConfirm(true)}
                                                >
                                                    Refazer configuração guiada
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => setShowTestChat(true)}
                                        >
                                            Testar assistente
                                        </button>
                                    </div>
                                </div>

                                {renderActivateCta()}
                                <AgentIAAdvancedOptions
                                    canEditPrompt={canEditPrompt}
                                    contactLabel={contactLabel}
                                    loadingPrompt={loadingPrompt}
                                    aiActionsEnabled={aiActionsEnabled}
                                    onAiActionsEnabledChange={setAiActionsEnabled}
                                    savingAiActions={savingAiActions}
                                    aiActionsSelected={aiActionsSelected}
                                    onToggleAiAction={toggleAiAction}
                                    conversationTimelineEnabled={conversationTimelineEnabled}
                                    onConversationTimelineChange={setConversationTimelineEnabled}
                                    onSaveAiActions={handleSaveAiActions}
                                    birthdayMessage={birthdayMessage}
                                    onBirthdayMessageChange={setBirthdayMessage}
                                    savingBirthdayMessage={savingBirthdayMessage}
                                    onSaveBirthdayMessage={handleSaveBirthdayMessage}
                                    faqItems={faqItems}
                                    onFaqItemsChange={setFaqItems}
                                    savingFaq={savingFaq}
                                    onSaveFaqData={handleSaveFaqData}
                                    loadingPromptPreview={loadingPromptPreview}
                                    onPreviewFullPrompt={handlePreviewFullPrompt}
                                    savingPrompt={savingPrompt}
                                />
                            </div>
                        )}

                        {!agentSidePanelOpen && promptConfigurado && iaAtiva && (
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
                                        <span className="text-small" style={{ display: 'inline-block', background: 'var(--color-primary-surface)', color: 'var(--color-primary-dark)', padding: '4px 10px', borderRadius: 999, fontWeight: 700, marginBottom: 10 }}>
                                            ● Ativo
                                        </span>
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                            Respondendo automaticamente no WhatsApp
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                                        {canEditPrompt && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ padding: '6px 12px', minHeight: 34 }}
                                                    disabled={loadingPrompt}
                                                    onClick={openManualEditor}
                                                >
                                                    Editar manualmente
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                                    disabled={loadingPrompt}
                                                    onClick={() => setShowReconfigureConfirm(true)}
                                                >
                                                    Refazer configuração guiada
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ padding: '6px 12px', minHeight: 34, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                            disabled={loadingPrompt}
                                            onClick={() => setShowTestChat(true)}
                                        >
                                            Testar assistente
                                        </button>
                                    </div>
                                </div>

                                {aiThreadsLimit > 0 && aiThreadsUsed >= aiThreadsLimit && !aiOverageEnabled && (
                                    <p className="agent-warning" style={{ marginTop: 14, marginBottom: 0 }}>
                                        Limite de conversas com assistente atingido neste ciclo ({aiThreadsUsed}/{aiThreadsLimit}). O atendimento automático pode ficar
                                        indisponível para novas conversas até o próximo ciclo ou até contratar mensagens extras no plano.
                                    </p>
                                )}

                                <AgentIAAdvancedOptions
                                    canEditPrompt={canEditPrompt}
                                    contactLabel={contactLabel}
                                    loadingPrompt={loadingPrompt}
                                    aiActionsEnabled={aiActionsEnabled}
                                    onAiActionsEnabledChange={setAiActionsEnabled}
                                    savingAiActions={savingAiActions}
                                    aiActionsSelected={aiActionsSelected}
                                    onToggleAiAction={toggleAiAction}
                                    conversationTimelineEnabled={conversationTimelineEnabled}
                                    onConversationTimelineChange={setConversationTimelineEnabled}
                                    onSaveAiActions={handleSaveAiActions}
                                    birthdayMessage={birthdayMessage}
                                    onBirthdayMessageChange={setBirthdayMessage}
                                    savingBirthdayMessage={savingBirthdayMessage}
                                    onSaveBirthdayMessage={handleSaveBirthdayMessage}
                                    faqItems={faqItems}
                                    onFaqItemsChange={setFaqItems}
                                    savingFaq={savingFaq}
                                    onSaveFaqData={handleSaveFaqData}
                                    loadingPromptPreview={loadingPromptPreview}
                                    onPreviewFullPrompt={handlePreviewFullPrompt}
                                    savingPrompt={savingPrompt}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            <ConfirmDialog
                open={showReconfigureConfirm}
                title="Refazer configuração guiada?"
                description="Isso substituirá as instruções atuais. Deseja continuar?"
                confirmLabel="Continuar"
                confirmVariant="primary"
                onConfirm={openReconfigureWizard}
                onClose={() => setShowReconfigureConfirm(false)}
            />

            <ConfirmDialog
                open={Boolean(waConfirm)}
                title={waConfirm?.title || ''}
                description={waConfirm?.description}
                confirmLabel={waConfirm?.confirmLabel || 'Confirmar'}
                loading={zap.waLoading}
                onConfirm={handleWaConfirmAction}
                onClose={() => (zap.waLoading ? undefined : setWaConfirm(null))}
            />

            <AgentIASidePanel
                open={agentSidePanelOpen}
                title={agentSidePanelMeta?.title || ''}
                subtitle={agentSidePanelMeta?.subtitle}
                wide={agentSidePanelMeta?.wide}
                onClose={closeAgentSidePanel}
            >
                {renderAgentSidePanelBody()}
            </AgentIASidePanel>

            <ModalShell
                open={showPromptPreview}
                title="Instruções completas do assistente"
                onClose={() => setShowPromptPreview(false)}
                maxWidth={720}
                dialogClassName="agent-ia-prompt-preview-modal"
            >
                <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
                    Texto completo enviado ao assistente antes de cada conversa.
                </p>
                <pre
                    style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        margin: 0,
                        color: 'var(--text)',
                        fontFamily: 'ui-monospace, Consolas, monospace',
                        maxHeight: '60vh',
                        overflow: 'auto',
                    }}
                >
                    {promptPreviewText}
                </pre>
            </ModalShell>

        </section>
        </>
    );
};

export default AgenteIASection;
