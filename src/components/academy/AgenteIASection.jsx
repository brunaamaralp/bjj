import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Copy, Check, Bot } from 'lucide-react';
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
import { useTerms, contactLabelSingular } from '../../lib/terminology.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import PageHeader from '../layout/PageHeader.jsx';
import AgentIASidePanel from './AgentIASidePanel.jsx';
import AgentIAPromptEditor from './AgentIAPromptEditor.jsx';
import AgentIATestChat from './AgentIATestChat.jsx';
import AgentIAAdvancedOptions from './AgentIAAdvancedOptions.jsx';
import AgentServiceControl from './AgentServiceControl.jsx';
import AgentIaStatusBadge from './AgentIaStatusBadge.jsx';
import AgentIaHeaderStatusChip from './AgentIaHeaderStatusChip.jsx';
import SettingRow from '../shared/SettingRow.jsx';
import {
  shouldShowAgentConfigBanner,
  getAgentStatusBadgeVariant,
  getAgentHeaderStatusChip,
  buildActivateConfirmDescription,
  AGENT_PAUSE_CONFIRM_DESCRIPTION,
  AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST,
} from '../../lib/agentIaServiceControl.js';
import { isPromptConfigured, formatInstructionsSavedAt, AGENT_SYSTEM_RULES } from './agentIaUtils.js';
import { useToast } from '../../hooks/useToast';
import { formatWaPhoneDisplay } from '../../../lib/zapsterInstancePhone.js';
import { formatWaAgentStatus } from '../../lib/waAgentStatusDisplay.js';
import { INTEGRACOES_WHATSAPP_PATH } from '../../lib/integracoesRoutes.js';
import { readAgentIaSetupIntent, readAgentIaFromIntegracoes } from '../../lib/agentIaRoutes.js';
import { isWaSetupStepDone } from '../../lib/waSetupProgress.js';
import { V1_AI_ACTIONS } from '../../../lib/agentActionConfig.js';
import './agent-ia.css';

const AgenteChatSetup = lazy(() => import('../inbox/AgenteChatSetup'));

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

function getAgentPageSubtitle(setupProgress) {
    const { currentStep, waDone, configDone, activeDone } = setupProgress;
    if (waDone && configDone && activeDone) return 'Assistente ativo no WhatsApp.';
    if (!waDone) return 'Conecte o WhatsApp em Integrações para configurar o assistente.';
    if (currentStep === 1) return 'Passo 1 de 2: configure o assistente.';
    if (currentStep === 2) return 'Passo 2 de 2: ative o atendimento automático.';
    return 'Defina respostas automáticas no WhatsApp.';
}

const AgenteIASection = ({ academyId, role, academyDoc, showPageHeader = true }) => {
    const terms = useTerms();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const setupIntentHandledRef = useRef(false);
    const labels = useLeadStore((s) => s.labels);
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const addToast = useUiStore((s) => s.addToast);
    const toast = useToast();
    const academyIdRef = useRef(academyId);
    useEffect(() => { academyIdRef.current = academyId; }, [academyId]);

    useEffect(() => {
        setupIntentHandledRef.current = false;
    }, [academyId]);

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
    const [showActivateServiceConfirm, setShowActivateServiceConfirm] = useState(false);
    const [showPauseServiceConfirm, setShowPauseServiceConfirm] = useState(false);

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
        setAcademyName(String(academyDoc?.name || '').trim());
    }, [academyDoc?.name]);

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
        const wasAgentActive = iaAtiva;
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
                if (!enabled && wasAgentActive) {
                    addToast({
                        type: 'info',
                        message: AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST,
                    });
                } else {
                    addToast({
                        type: 'success',
                        message: enabled ? 'Recursos de IA ativados' : 'Recursos de IA desativados',
                    });
                }
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

    const card2Active = promptConfigurado && iaAtiva;
    const waPhoneDisplay = formatWaPhoneDisplay(zap.waInfo?.phone);

    const setupProgress = useMemo(() => {
        const waDone = isWaSetupStepDone({
            waConnected: zap.waConnected,
            waStatus: zap.waStatus,
            instanceId: zap.waInfo?.instance_id,
        });
        const configDone = promptConfigurado;
        const activeDone = iaAtiva;
        let currentStep = 0;
        if (waDone && !configDone) currentStep = 1;
        else if (waDone && configDone && !activeDone) currentStep = 2;
        let statusLine = '';
        if (waDone && configDone && !activeDone) {
            statusLine = 'Conectado, mas atendimento pausado';
        }
        return { waDone, configDone, activeDone, currentStep, statusLine };
    }, [zap.waConnected, zap.waStatus, zap.waInfo?.instance_id, promptConfigurado, iaAtiva]);

    useEffect(() => {
        if (setupIntentHandledRef.current) return;
        if (!readAgentIaSetupIntent(searchParams)) return;
        if (loadingPrompt) return;

        setupIntentHandledRef.current = true;
        setSearchParams({}, { replace: true });

        if (!setupProgress.waDone) return;

        if (promptConfigurado) {
            addToast({
                type: 'info',
                message: 'Assistente já configurado — você pode ativar ou ajustar abaixo.',
            });
            return;
        }
        if (!canEditPrompt) return;

        setShowEditor(false);
        setShowTestChat(false);
        setShowWizard(true);
    }, [
        searchParams,
        setSearchParams,
        loadingPrompt,
        setupProgress.waDone,
        promptConfigurado,
        canEditPrompt,
        addToast,
    ]);

    const focusAssistant =
        setupProgress.waDone && (setupProgress.currentStep === 1 || setupProgress.currentStep === 2);

    const card2Class = [
        'agent-ia-card',
        card2Active ? 'agent-ia-card--assistant-active' : '',
        focusAssistant ? 'agent-ia-card--focus' : '',
        !setupProgress.waDone ? 'agent-ia-card--deferred' : '',
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

    const pageHeaderStatusChip = useMemo(
        () => getAgentHeaderStatusChip({ promptConfigurado, iaAtiva }),
        [promptConfigurado, iaAtiva]
    );

    const activateServiceConfirmDescription = useMemo(
        () =>
            buildActivateConfirmDescription({
                waPhoneDisplay: formatWaPhoneDisplay(zap.waInfo?.phone),
                aiThreadsUsed,
                aiThreadsLimit,
                aiOverageEnabled,
            }),
        [zap.waInfo?.phone, aiThreadsUsed, aiThreadsLimit, aiOverageEnabled]
    );

    const confirmActivateService = () => {
        setShowActivateServiceConfirm(false);
        void handleToggleIa(true);
    };

    const confirmPauseService = () => {
        setShowPauseServiceConfirm(false);
        void handleToggleIa(false);
    };

    const handleCopyIntegracoesLink = useCallback(async () => {
        const url =
            typeof window !== 'undefined'
                ? `${window.location.origin}${INTEGRACOES_WHATSAPP_PATH}`
                : INTEGRACOES_WHATSAPP_PATH;
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copiado. Envie ao dono da academia.');
        } catch {
            toast.error('Não foi possível copiar o link.');
        }
    }, [toast]);

    const servicePanelOpen = showWizard || showEditor || showTestChat;

    const openReconfigureWizard = () => {
        setShowReconfigureConfirm(false);
        setShowWizard(true);
        setShowEditor(false);
        setShowTestChat(false);
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
        (() => {
            const fromIntegracoes =
                readAgentIaFromIntegracoes(searchParams) || Boolean(location.state?.fromIntegracoes);
            const backTo = fromIntegracoes ? INTEGRACOES_WHATSAPP_PATH : '/inbox';
            const backLabel = fromIntegracoes ? 'Voltar para Integrações' : 'Voltar para conversas';
            return (
                <Link
                    to={backTo}
                    className="edit-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
                >
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                    {backLabel}
                </Link>
            );
        })()
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
                    actions={
                        pageHeaderStatusChip ? (
                            <AgentIaHeaderStatusChip
                                label={pageHeaderStatusChip.label}
                                variant={pageHeaderStatusChip.variant}
                            />
                        ) : null
                    }
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
            {!setupProgress.waDone ? (
                <StatusBanner variant="warning">
                    <span>
                        {isOwner
                            ? 'Conecte o WhatsApp em Integrações para configurar o assistente de atendimento.'
                            : 'Peça ao dono da academia para conectar o WhatsApp em Integrações.'}
                        {isOwner ? (
                            <>
                                {' '}
                                <Link to={INTEGRACOES_WHATSAPP_PATH} className="edit-link">
                                    Abrir Integrações
                                </Link>
                            </>
                        ) : null}
                    </span>
                </StatusBanner>
            ) : (
                <div
                    className="agent-ia-wa-link-banner"
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: zap.waConnected ? 'rgba(37, 211, 102, 0.06)' : 'var(--surface)',
                    }}
                >
                    <span className="text-small" style={{ flex: 1, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                        WhatsApp: <strong style={{ color: 'var(--text)' }}>{formatWaAgentStatus(zap.waStatus)}</strong>
                        {waPhoneDisplay ? (
                            <>
                                {' '}
                                · <strong style={{ color: 'var(--text)' }}>{waPhoneDisplay}</strong>
                            </>
                        ) : null}
                    </span>
                    <Link to={INTEGRACOES_WHATSAPP_PATH} className="btn btn-outline btn-sm">
                        Gerenciar em Integrações
                    </Link>
                </div>
            )}

            {!setupProgress.waDone && !isOwner ? (
                <div
                    className="agent-ia-member-wa-hint"
                    role="note"
                    style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => void handleCopyIntegracoesLink()}
                    >
                        <Copy size={14} aria-hidden />
                        Copiar link de Integrações
                    </button>
                </div>
            ) : null}

            {setupProgress.waDone ? (
                <div className="agent-ia-setup-panel" role="region" aria-label="Progresso da configuração">
                    <div className="agent-ia-setup-steps">
                        {[
                            { n: 1, label: 'Configurar assistente', done: setupProgress.configDone },
                            { n: 2, label: 'Ativar', done: setupProgress.activeDone },
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
            ) : null}

            {/* Card 2 — Assistente */}
            <div className={card2Class}>
                {!setupProgress.waDone ? (
                    <p className="agent-ia-deferred-hint" role="note">
                        Disponível após conectar o WhatsApp —{' '}
                        <Link to={INTEGRACOES_WHATSAPP_PATH} className="edit-link">
                            abra Integrações
                        </Link>{' '}
                        para conectar o número.
                    </p>
                ) : null}
                {shouldShowAgentConfigBanner(iaAtiva) ? (
                    <p className="agent-ia-config-banner" role="note">
                        Ambiente de configuração — nada aqui vai para alunos até ativar e conectar WhatsApp.
                    </p>
                ) : null}
                {canEditPrompt ? (
                    <SettingRow
                        className="agent-ia-master-toggle"
                        label="Recursos de IA"
                        hint="Barra ⌘K, copilot, imports assistidos, sandbox"
                        control={
                            <button
                                type="button"
                                role="switch"
                                aria-checked={aiModuleEnabled}
                                aria-label={aiModuleEnabled ? 'Desativar recursos de IA' : 'Ativar recursos de IA'}
                                onClick={() => void handleToggleAiModule(!aiModuleEnabled)}
                                disabled={savingAiModule}
                                className={`ai-switch${aiModuleEnabled ? ' ai-switch--on' : ''}${savingAiModule ? ' ai-switch--loading' : ''}`}
                                title={aiModuleEnabled ? 'Desativar recursos de IA' : 'Ativar recursos de IA'}
                            >
                                <span className="ai-switch-thumb" aria-hidden />
                            </button>
                        }
                    />
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
                </div>

                {loadingPrompt ? (
                    <div className="empresa-skeleton-block" style={{ height: 80 }} aria-busy="true" aria-label="Carregando configurações do assistente" />
                ) : (
                    <>
                        {renderAgentSidePanelHint()}

                        {!agentSidePanelOpen && !promptConfigurado && (
                            <div>
                                <AgentIaStatusBadge variant="unconfigured" />
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
                                        <AgentIaStatusBadge variant="ready" />
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

                                <AgentServiceControl
                                    promptConfigurado={promptConfigurado}
                                    canEditPrompt={canEditPrompt}
                                    iaAtiva={iaAtiva}
                                    aiModuleEnabled={aiModuleEnabled}
                                    waConnected={zap.waConnected}
                                    togglingIa={togglingIa}
                                    panelOpen={servicePanelOpen}
                                    onRequestActivate={() => setShowActivateServiceConfirm(true)}
                                    onRequestPause={() => setShowPauseServiceConfirm(true)}
                                />
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <AgentIaStatusBadge
                                            variant={getAgentStatusBadgeVariant({
                                                promptConfigurado,
                                                iaAtiva,
                                                waConnected: zap.waConnected,
                                            })}
                                        />
                                        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                            {!zap.waConnected
                                                ? 'O assistente não consegue responder até reconectar o WhatsApp no card acima.'
                                                : 'Respondendo automaticamente no WhatsApp'}
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

                                <AgentServiceControl
                                    promptConfigurado={promptConfigurado}
                                    canEditPrompt={canEditPrompt}
                                    iaAtiva={iaAtiva}
                                    aiModuleEnabled={aiModuleEnabled}
                                    waConnected={zap.waConnected}
                                    togglingIa={togglingIa}
                                    panelOpen={servicePanelOpen}
                                    onRequestActivate={() => setShowActivateServiceConfirm(true)}
                                    onRequestPause={() => setShowPauseServiceConfirm(true)}
                                />

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
                open={showActivateServiceConfirm}
                title="Ativar atendimento automático?"
                description={activateServiceConfirmDescription}
                confirmLabel="Ativar"
                confirmVariant="primary"
                loading={togglingIa}
                onConfirm={confirmActivateService}
                onClose={() => (togglingIa ? undefined : setShowActivateServiceConfirm(false))}
            />

            <ConfirmDialog
                open={showPauseServiceConfirm}
                title="Pausar atendimento automático?"
                description={AGENT_PAUSE_CONFIRM_DESCRIPTION}
                confirmLabel="Pausar"
                confirmVariant="danger"
                loading={togglingIa}
                onConfirm={confirmPauseService}
                onClose={() => (togglingIa ? undefined : setShowPauseServiceConfirm(false))}
            />

            <ConfirmDialog
                open={showReconfigureConfirm}
                title="Refazer configuração guiada?"
                description="Isso substituirá as instruções atuais. Deseja continuar?"
                confirmLabel="Continuar"
                confirmVariant="primary"
                onConfirm={openReconfigureWizard}
                onClose={() => setShowReconfigureConfirm(false)}
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
