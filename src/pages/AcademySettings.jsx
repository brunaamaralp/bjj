import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { resolveEmpresaLegacyTabRedirect } from '../lib/empresaLegacyRedirects.js';
import { friendlyError } from '../lib/errorMessages';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACADEMIES_COL, createSessionJwt } from '../lib/appwrite';
import { saveAcademySettingsApi } from '../lib/academySettingsApi.js';
import {
  getAcademyDocument,
  invalidateAcademyDocumentCache,
} from '../lib/getAcademyDocument.js';
import {
    ChevronLeft,
} from 'lucide-react';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';

const StudentsSection = lazyWithRetry(() => import('../components/academy/StudentsSection.jsx'));
const EstudioSection = lazyWithRetry(() => import('../components/academy/EstudioSection'));
const FunilSection = lazyWithRetry(() => import('../components/academy/FunilSection'));
const FinanceiroConfigTab = lazyWithRetry(() => import('../components/finance/FinanceiroConfigTab.jsx'));
import { readStudentExitReasonsFromAcademyDoc } from '../lib/studentExitConfig.js';
import { readStudentFreezeReasonsFromAcademyDoc } from '../lib/studentFreezeConfig.js';
import { isBillingLive } from '../lib/billingEnabled';
import { validateCpfCnpj } from '../../lib/billing/validation.js';
import { mergeNaviWizardIntoModulesPayload } from '../../lib/naviWizardData.js';
import { useUserRole } from '../lib/useUserRole';
import { useTerms } from '../lib/terminology.js';

const TABS_ALL = [
    { id: 'estudio', label: 'Estúdio' },
    { id: 'funil', label: 'Funil' },
    { id: 'alunos', label: 'Alunos' },
    { id: 'financeiro', label: 'Financeiro' },
];

const VALID_TAB_IDS = new Set(TABS_ALL.map((t) => t.id));

const TAB_SKELETON_HEIGHT = {
    estudio: 420,
    funil: 480,
    alunos: 400,
    financeiro: 520,
};

function getTabDisabledState(tabId, { role }) {
    if (tabId === 'financeiro' && role !== 'owner') {
        return { disabled: true, title: 'Disponível para titulares' };
    }
    return { disabled: false, title: undefined };
}

function EmpresaTabSkeleton({ tabId }) {
    const height = TAB_SKELETON_HEIGHT[tabId] || 400;
    return (
        <div
            className="empresa-section mt-4"
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Carregando configurações"
        >
            <div className="empresa-skeleton-block" style={{ height: 28, maxWidth: 200, marginBottom: 16 }} />
            <div className="empresa-skeleton-block" style={{ height, maxWidth: '100%' }} />
            <div className="empresa-skeleton-block" style={{ height: 44, maxWidth: 160, marginTop: 20 }} />
        </div>
    );
}

const AcademySettings = () => {
    const terms = useTerms();
    const academyId = useLeadStore((s) => s.academyId);
    const academyList = useLeadStore((s) => s.academyList);
    const billingAccess = useLeadStore((s) => s.billingAccess);
    const addToast = useUiStore((s) => s.addToast);
    const taxInputRef = useRef(null);
    const [taxDocumentInput, setTaxDocumentInput] = useState('');

    const [searchParams, setSearchParams] = useSearchParams();

    const [academyLoadState, setAcademyLoadState] = useState('idle');
    const [academyReloadNonce, setAcademyReloadNonce] = useState(0);
    const [academyDataVersion, setAcademyDataVersion] = useState(0);

    const [academy, setAcademy] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        quickTimes: '',
        vertical: 'fitness',
        uiLabels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
        modules: { sales: false, inventory: false, finance: false },
        customLeadQuestions: [],
        studentExitReasons: [],
        studentFreezeReasons: [],
        settings: '',
        teamId: '',
        ownerId: '',
    });
    const focus = searchParams.get('focus');
    const autoEditTax = focus === 'tax';

    const academyForRole = useMemo(() => {
        const fromList = (academyList || []).find((a) => a.id === academyId);
        const ownerId =
            academyLoadState === 'ok'
                ? String(academy.ownerId || fromList?.ownerId || '')
                : String(fromList?.ownerId || academy.ownerId || '');
        return {
            ownerId,
            teamId: String(academy.teamId || fromList?.teamId || ''),
        };
    }, [academy.ownerId, academy.teamId, academyList, academyId, academyLoadState]);

    const role = useUserRole(academyForRole);

    const rawTab = searchParams.get('tab') || '';
    const activeTab = VALID_TAB_IDS.has(rawTab) ? rawTab : 'estudio';

    const tabDisabledState = useMemo(
        () => getTabDisabledState(activeTab, { role, modules: academy.modules }),
        [activeTab, role, academy.modules]
    );

    const contentLoading =
        Boolean(academyId) && (academyLoadState === 'loading' || academyLoadState === 'idle');

    const taxUpdateNeeded = Boolean(
        isBillingLive() &&
            billingAccess &&
            billingAccess.status !== 'preview' &&
            billingAccess.accessLevel &&
            billingAccess.accessLevel !== 'none' &&
            billingAccess.companyTaxOk === false
    );

    // Redirect invalid/disabled tabs and handle ?focus=tax (only after academy fetch)
    useEffect(() => {
        if (!VALID_TAB_IDS.has(rawTab)) {
            setSearchParams({ tab: 'estudio' }, { replace: true });
            return;
        }
        if (academyLoadState === 'loading' || academyLoadState === 'idle') {
            return;
        }
        if (academyLoadState === 'ok') {
            const { disabled } = getTabDisabledState(rawTab, { role, modules: academy.modules });
            if (disabled) {
                setSearchParams({ tab: 'estudio' }, { replace: true });
                return;
            }
        }
        if (autoEditTax && activeTab !== 'estudio') {
            setSearchParams((prev) => { prev.set('tab', 'estudio'); return prev; }, { replace: true });
        }
    }, [rawTab, autoEditTax, activeTab, academyLoadState, role, academy.modules, setSearchParams]);

    useEffect(() => {
        if (autoEditTax && activeTab === 'estudio') {
            const t = window.setTimeout(() => {
                taxInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [autoEditTax, activeTab]);

    const createId = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch (e) {
            console.error('[AcademySettings] erro:', e);
            addToast({ type: 'error', message: friendlyError(e, 'save') });
        }
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    const normalizeQuestions = (input) => {
        let raw = input;
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { raw = []; }
        }
        if (!Array.isArray(raw)) return { questions: [], migrated: false };
        const cleaned = raw.filter(Boolean);
        if (cleaned.length === 0) return { questions: [], migrated: false };

        let migrated = false;
        if (typeof cleaned[0] === 'string') {
            migrated = true;
            const questions = cleaned
                .map((label) => String(label || '').trim())
                .filter(Boolean)
                .map((label) => ({ id: createId(), label, type: 'text' }));
            return { questions, migrated };
        }

        const questions = cleaned.map((q) => {
            const label = String(q?.label || q?.name || '').trim();
            let id = String(q?.id || '').trim();
            const type = String(q?.type || 'text').trim() || 'text';
            if (!label) {
                migrated = true;
                return null;
            }
            if (!id) {
                migrated = true;
                id = createId();
            }
            if (q?.label !== label || q?.id !== id || q?.type !== type) migrated = true;
            return { id, label, type };
        }).filter(Boolean);

        return { questions, migrated };
    };

    useEffect(() => {
        if (!academyId) {
            setAcademyLoadState('idle');
            return undefined;
        }
        let cancelled = false;
        setAcademyLoadState('loading');
        (async () => {
            try {
                const doc = await getAcademyDocument(academyId);
                if (cancelled) return;
                let labels = { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' };
                let mods = { sales: false, inventory: false, finance: false };
                try {
                    if (doc.uiLabels) {
                        const parsed = typeof doc.uiLabels === 'string' ? JSON.parse(doc.uiLabels) : doc.uiLabels;
                        if (parsed && typeof parsed === 'object') {
                            labels = { ...labels, ...parsed };
                        }
                    }
                    if (doc.modules) {
                        const parsedMods = typeof doc.modules === 'string' ? JSON.parse(doc.modules) : doc.modules;
                        if (parsedMods && typeof parsedMods === 'object') {
                            mods = { ...mods, ...parsedMods };
                        }
                    }
                } catch (e) {
                    console.error('[AcademySettings] erro:', e);
                    addToast({ type: 'error', message: friendlyError(e, 'save') });
                }
                const normalized = normalizeQuestions(doc.customLeadQuestions);
                const verticalRaw = String(doc.vertical || '').trim();
                const vertical = verticalRaw === 'physio' ? 'physio' : 'fitness';
                setAcademy({
                    name: doc.name || '',
                    phone: doc.phone || '',
                    email: doc.email || '',
                    address: doc.address || '',
                    quickTimes: doc.quickTimes || '',
                    vertical,
                    uiLabels: labels,
                    modules: mods,
                    teamId: doc.teamId || '',
                    ownerId: String(doc.ownerId || ''),
                    customLeadQuestions: normalized.questions,
                    studentExitReasons: readStudentExitReasonsFromAcademyDoc(doc),
                    studentFreezeReasons: readStudentFreezeReasonsFromAcademyDoc(doc),
                    settings: doc.settings || '',
                });
                try {
                    useLeadStore.getState().setVertical(vertical);
                } catch (e) {
                    console.error('[AcademySettings] setVertical:', e);
                }
                if (normalized.migrated) {
                    try {
                        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                            customLeadQuestions: JSON.stringify(normalized.questions)
                        });
                        invalidateAcademyDocumentCache(academyId);
                    } catch (e) {
                        console.error('[AcademySettings] erro:', e);
                        addToast({ type: 'error', message: friendlyError(e, 'save') });
                    }
                }
                setAcademyLoadState('ok');
                setAcademyDataVersion((v) => v + 1);
            } catch (e) {
                if (!cancelled) {
                    console.error('fetch academy:', e);
                    setAcademyLoadState('error');
                }
            }
        })();
        return () => { cancelled = true; };
    // normalizeQuestions/addToast são helpers estáveis; fetch keyed em academyId/reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- academy document load
    }, [academyId, academyReloadNonce]);

    const handleSave = async (saveOptions = {}) => {
        if (!academyId) return;
        try {
            const taxTrim = String(taxDocumentInput || '').trim();
            if (role === 'owner' && taxUpdateNeeded && taxTrim) {
                const v = validateCpfCnpj(taxTrim);
                if (!v.ok) {
                    addToast({ type: 'error', message: v.error });
                    throw new Error('tax');
                }
                const jwt = await createSessionJwt();
                if (!jwt) {
                    addToast({ type: 'error', message: 'Sessão inválida. Entre de novo.' });
                    throw new Error('tax');
                }
                const r = await fetch('/api/billing?action=update-customer-tax', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${jwt}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ storeId: academyId, cpfCnpj: v.digits }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok || !data.sucesso) {
                    addToast({ type: 'error', message: data.erro || 'Não foi possível salvar o CPF/CNPJ.' });
                    throw new Error('tax');
                }
                setTaxDocumentInput('');
                const b = useLeadStore.getState().billingAccess;
                if (b) {
                    useLeadStore.getState().setBillingAccess({ ...b, companyTaxOk: true });
                }
                try {
                    await useLeadStore.getState().completeOnboardingStepIds(['company_tax']);
                } catch (e) {
                    console.error('[AcademySettings] erro:', e);
                    addToast({ type: 'error', message: friendlyError(e, 'save') });
                }
            }

            let modulesPayload = academy.modules || {};
            try {
                const curDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
                modulesPayload = mergeNaviWizardIntoModulesPayload(academy.modules || {}, curDoc?.modules);
            } catch {
                void 0;
            }
            const vertical = String(academy.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
            await saveAcademySettingsApi(academyId, {
                name: academy.name,
                phone: String(academy.phone || '').replace(/\D/g, ''),
                email: academy.email,
                address: academy.address,
                quickTimes: academy.quickTimes || '',
                vertical,
                uiLabels: academy.uiLabels || {},
                modules: modulesPayload,
            });
            invalidateAcademyDocumentCache(academyId);
            try {
                useLeadStore.getState().setLabels(academy.uiLabels || {});
                useLeadStore.getState().setModules(academy.modules || {});
                useLeadStore.getState().setVertical(vertical);
            } catch (e) {
                console.error('[AcademySettings] erro:', e);
                addToast({ type: 'error', message: friendlyError(e, 'save') });
            }
            addToast({
                type: 'success',
                message:
                    saveOptions.successMessage ||
                    `Configurações da ${terms.workspaceNoun} salvas.`,
            });
        } catch (e) {
            if (String(e?.message) === 'tax') {
                throw e;
            }
            console.error('save academy:', e);
            addToast({ type: 'error', message: 'Não foi possível salvar as configurações.' });
            throw e;
        }
    };

    const setActiveTab = (id) => {
        const { disabled } = getTabDisabledState(id, { role, modules: academy.modules });
        if (disabled) return;
        setSearchParams({ tab: id });
    };

    const legacyEmpresaRedirect = resolveEmpresaLegacyTabRedirect(rawTab);
    if (legacyEmpresaRedirect) {
        return <Navigate to={legacyEmpresaRedirect} replace />;
    }

    return (
        <div className="container navi-hub-page academy-settings-page">
            <PageHeader
                title={terms.myWorkspace}
                subtitle="Dados da academia, funil, alunos e financeiro."
                prefix={
                    <Link
                        to="/"
                        className="edit-link"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
                    >
                        <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                        Voltar ao painel
                    </Link>
                }
            />

            {academyLoadState === 'error' && (
                <div className="error-banner" role="alert">
                    <span>Não foi possível carregar as configurações.</span>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setAcademyReloadNonce((n) => n + 1)}
                    >
                        Tentar novamente
                    </button>
                </div>
            )}

            <HubTabBar
                tabs={TABS_ALL.map((tab) => {
                    const { disabled, title } = getTabDisabledState(tab.id, {
                        role,
                        modules: academy.modules,
                    });
                    return {
                        id: tab.id,
                        label: tab.label,
                        disabled,
                        disabledTitle: title,
                    };
                })}
                activeId={activeTab}
                onChange={setActiveTab}
                ariaLabel={`Seções da ${terms.workspaceNoun}`}
                variant="secondary"
                size="sm"
                fullWidth
                className="empresa-subnav"
            />

            {contentLoading ? <EmpresaTabSkeleton tabId={activeTab} /> : null}

            {!contentLoading && !tabDisabledState.disabled ? (
                <Suspense fallback={<EmpresaTabSkeleton tabId={activeTab} />}>
            {activeTab === 'estudio' && (
                <>
                    <EstudioSection
                        academyId={academyId}
                        academy={academy}
                        setAcademy={setAcademy}
                        onSave={handleSave}
                        taxUpdateNeeded={taxUpdateNeeded}
                        companyTaxRegistered={Boolean(billingAccess?.companyTaxOk)}
                        billingLive={isBillingLive()}
                        taxDocumentInput={taxDocumentInput}
                        setTaxDocumentInput={setTaxDocumentInput}
                        taxInputRef={taxInputRef}
                        autoEditTax={autoEditTax}
                        academyDataVersion={academyDataVersion}
                    />
                </>
            )}

            {activeTab === 'funil' && (
                <FunilSection
                    academy={academy}
                    setAcademy={setAcademy}
                    academyId={academyId}
                    academyDataVersion={academyDataVersion}
                    onSave={handleSave}
                />
            )}

            {activeTab === 'alunos' && (
                <StudentsSection
                    academy={academy}
                    setAcademy={setAcademy}
                    academyId={academyId}
                    academyDataVersion={academyDataVersion}
                />
            )}

            {activeTab === 'financeiro' && academyId && (
                <div className="empresa-section">
                    <FinanceiroConfigTab academyId={academyId} isOwner={role === 'owner'} />
                </div>
            )}
                </Suspense>
            ) : null}

            <style dangerouslySetInnerHTML={{
                __html: `
        .empresa-section { scroll-margin-top: 52px; }
        .empresa-subnav {
          position: sticky;
          top: 0;
          z-index: 8;
          margin: 8px 0 20px;
        }
        .empresa-subnav.navi-hub-tabs {
          width: 100%;
        }
        .finance-config-jump {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--v50);
          border: 1px solid var(--border-light);
        }
        .finance-config-jump-link {
          font-size: 0.78rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .finance-config-jump-link:hover {
          background: var(--surface-hover);
          color: var(--text);
        }
        .finance-config-jump-link--active {
          background: var(--v500);
          border-color: var(--v500);
          color: #fff;
        }
        .finance-config-jump-link--active:hover {
          background: var(--v600, var(--v500));
          color: #fff;
        }
        .finance-installments-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          margin-top: 4px;
          border-radius: 8px;
          border: 1px solid var(--border-light);
          background: var(--surface);
          cursor: pointer;
          text-align: left;
        }
        .finance-installments-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .empresa-subnav .navi-hub-tab--disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .account-hero { border-top: 4px solid var(--accent); }
        .account-avatar {
          width: 56px; height: 56px; border-radius: 16px;
          background: var(--accent-light); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .edit-link {
          background: none; color: var(--accent); font-size: 0.85rem;
          font-weight: 600; padding: 4px 0; min-height: auto;
        }
        .info-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; border-bottom: 0.5px solid var(--border-light);
        }
        .info-row:last-child { border-bottom: none; }
        .info-row-icon { color: var(--text-muted); flex-shrink: 0; }
        .info-row-label { font-size: 13px; color: var(--text-secondary); min-width: 80px; font-weight: 500; }
        .info-row-value { font-size: 14px; color: var(--text); font-weight: 500; }
        .info-row-empty { font-size: 13px; color: var(--text-muted); }
        .action-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; border-bottom: 0.5px solid var(--border-light);
          transition: background var(--motion-fast) var(--ease-standard);
        }
        .action-row:last-child { border-bottom: none; }
        .action-row:hover { background: rgba(108, 71, 216, 0.03); }
        .action-icon {
          width: 40px; height: 40px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .btn-danger {
          background: var(--danger); color: white;
          border-radius: var(--radius-sm); font-weight: 700;
        }
        .field-error {
          margin-top: 6px; font-size: 0.75rem; color: var(--danger); font-weight: 600;
        }
        /* Toggle switch para Agente IA */
        .ai-switch {
          position: relative;
          width: 48px;
          height: 28px;
          border-radius: 999px;
          border: none;
          background: var(--border, #d1d5db);
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
          transition: background 0.2s ease;
        }
        .ai-switch--on { background: var(--accent); }
        .ai-switch:disabled { opacity: 0.45; cursor: not-allowed; }
        .ai-switch--loading { opacity: 0.7; }
        .ai-switch-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          display: block;
        }
        .ai-switch--on .ai-switch-thumb {
          transform: translateX(20px);
        }
        @keyframes empresaSk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .empresa-skeleton-block {
          border-radius: 10px;
          width: 100%;
          max-width: 420px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: empresaSk 1.2s ease-in-out infinite;
        }
        .error-banner {
          display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
          padding: 12px 14px; margin: 12px 0 16px; border-radius: 10px;
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.35);
          color: var(--text);
          font-size: 0.9rem;
        }
        .section-error {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
          padding: 12px 14px; margin-bottom: 12px; border-radius: 8px;
          background: rgba(220, 38, 38, 0.06);
          border: 1px solid rgba(220, 38, 38, 0.28);
          font-size: 0.88rem;
          color: var(--text);
        }
        .unsaved-banner {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
          padding: 10px 14px; margin-bottom: 12px; border-radius: 8px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.35);
          font-size: 0.9rem;
          color: var(--text);
        }
        .academy-settings-page .form-input,
        .academy-settings-page .input,
        .academy-settings-page .agent-field-textarea {
          font-size: 16px;
        }
        .academy-settings-page button:not(.icon-only):not(.ai-switch) {
          min-height: 44px;
          padding-inline: 16px;
        }
        .academy-settings-page .icon-btn-remove {
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .academy-settings-page .stage-editor-head {
          display: grid;
          grid-template-columns: 1fr 90px;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .academy-settings-page .stage-row {
          display: grid;
          grid-template-columns: 1fr 90px;
          gap: 8px;
          margin-bottom: 8px;
        }
        .academy-settings-page .stage-input,
        .academy-settings-page .stage-sla {
          padding: 8px 10px;
        }
        .academy-settings-page .stage-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .academy-settings-page .stage-actions .grow {
          flex: 1 1 auto;
        }
        .academy-settings-page .academy-tab-settings-layout,
        .academy-settings-page .financeiro-config-tab .academy-tab-settings-layout {
          margin-top: var(--space-3);
        }
      `}} />
        </div>
    );
};

export default AcademySettings;
