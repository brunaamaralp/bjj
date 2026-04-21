import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { friendlyError } from '../lib/errorMessages';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACADEMIES_COL, createSessionJwt } from '../lib/appwrite';
import { ChevronLeft, Building2, Filter, Users, Settings, Wallet2 } from 'lucide-react';
import EstudioSection from '../components/academy/EstudioSection';
import FunilSection from '../components/academy/FunilSection';
import EquipeSection from '../components/academy/EquipeSection';
import AvancadoSection from '../components/academy/AvancadoSection';
import ConfigTab from '../components/finance/ConfigTab.jsx';
import { isBillingLive } from '../lib/billingEnabled';
import { validateCpfCnpj } from '../../lib/billing/validation.js';
import { mergeNaviWizardIntoModulesPayload } from '../../lib/naviWizardData.js';
import { useUserRole } from '../lib/useUserRole';

const TABS_ALL = [
    { id: 'estudio', label: 'Estúdio', Icon: Building2 },
    { id: 'funil', label: 'Funil', Icon: Filter },
    { id: 'financeiro', label: 'Financeiro', Icon: Wallet2 },
    { id: 'equipe', label: 'Equipe', Icon: Users },
    { id: 'avancado', label: 'Avançado', Icon: Settings },
];

const AcademySettings = () => {
    const { leads } = useLeadStore();
    const academyId = useLeadStore((s) => s.academyId);
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
        uiLabels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
        modules: { sales: false, inventory: false, finance: false },
        customLeadQuestions: [],
        teamId: '',
        ownerId: '',
    });

    const focus = searchParams.get('focus');
    const autoEditTax = focus === 'tax';

    const role = useUserRole(academy);

    const TABS = useMemo(() => TABS_ALL.filter((t) => t.id !== 'financeiro' || role === 'owner'), [role]);
    const VALID_TABS = useMemo(() => new Set(TABS.map((t) => t.id)), [TABS]);

    const rawTab = searchParams.get('tab') || '';
    const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'estudio';

    const taxUpdateNeeded = Boolean(
        isBillingLive() &&
            billingAccess &&
            billingAccess.status !== 'preview' &&
            billingAccess.accessLevel &&
            billingAccess.accessLevel !== 'none' &&
            billingAccess.companyTaxOk === false
    );

    // Redirect bare /empresa to ?tab=estudio and handle ?focus=tax
    useEffect(() => {
        if (!VALID_TABS.has(rawTab)) {
            setSearchParams({ tab: 'estudio' }, { replace: true });
            return;
        }
        if (autoEditTax && activeTab !== 'estudio') {
            setSearchParams((prev) => { prev.set('tab', 'estudio'); return prev; }, { replace: true });
        }
    }, [rawTab, autoEditTax, VALID_TABS, activeTab, setSearchParams]);

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
                const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
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
                setAcademy({
                    name: doc.name || '',
                    phone: doc.phone || '',
                    email: doc.email || '',
                    address: doc.address || '',
                    quickTimes: doc.quickTimes || '',
                    uiLabels: labels,
                    modules: mods,
                    teamId: doc.teamId || '',
                    ownerId: String(doc.ownerId || ''),
                    customLeadQuestions: normalized.questions,
                });
                if (normalized.migrated) {
                    try {
                        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                            customLeadQuestions: JSON.stringify(normalized.questions)
                        });
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
    }, [academyId, academyReloadNonce]);

    const handleSave = async () => {
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
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                name: academy.name,
                phone: String(academy.phone || '').replace(/\D/g, ''),
                email: academy.email,
                address: academy.address,
                quickTimes: academy.quickTimes || '',
                uiLabels: JSON.stringify(academy.uiLabels || {}),
                modules: JSON.stringify(modulesPayload),
            });
            try {
                useLeadStore.getState().setLabels(academy.uiLabels || {});
                useLeadStore.getState().setModules(academy.modules || {});
            } catch (e) {
                console.error('[AcademySettings] erro:', e);
                addToast({ type: 'error', message: friendlyError(e, 'save') });
            }
            addToast({ type: 'success', message: 'Configurações da academia salvas.' });
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
        setSearchParams({ tab: id });
    };

    return (
        <div className="container academy-settings-page" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <Link
                    to="/conta"
                    className="edit-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
                >
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                    Voltar à conta
                </Link>
                <h2 className="navi-page-title">{academy.name || 'Minha academia'}</h2>
                <p className="academy-settings-page-subtitle">Configurações da academia</p>
            </div>

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

            <nav className="empresa-subnav" aria-label="Seções da academia">
                <div className="empresa-subnav-scroll">
                    {TABS.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            type="button"
                            className={`empresa-subnav-tab ${activeTab === id ? 'empresa-subnav-tab--active' : ''}`}
                            onClick={() => setActiveTab(id)}
                        >
                            <Icon size={15} className="empresa-tab-icon" aria-hidden />
                            {label}
                        </button>
                    ))}
                </div>
            </nav>

            {activeTab === 'estudio' && (
                <EstudioSection
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
                />
            )}

            {activeTab === 'funil' && (
                <FunilSection
                    academy={academy}
                    setAcademy={setAcademy}
                    academyId={academyId}
                    academyDataVersion={academyDataVersion}
                />
            )}

            {activeTab === 'financeiro' && academyId && (
                <div className="empresa-section" style={{ marginTop: 8 }}>
                    <ConfigTab academyId={academyId} />
                </div>
            )}

            {activeTab === 'equipe' && (
                <EquipeSection
                    academy={academy}
                    academyId={academyId}
                />
            )}

            {activeTab === 'avancado' && (
                <AvancadoSection
                    academy={academy}
                    leads={leads}
                />
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .empresa-section { scroll-margin-top: 52px; }
        .empresa-subnav {
          position: sticky;
          top: 0;
          z-index: 8;
          margin: 8px -6px 20px;
          padding: 0 6px;
          background: var(--bg);
          border-bottom: 2px solid var(--border-light);
        }
        .empresa-subnav-scroll {
          display: flex;
          flex-wrap: nowrap;
          gap: 0;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .empresa-subnav-scroll::-webkit-scrollbar { display: none; }
        .empresa-subnav-tab {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 11px 18px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease;
          font-family: var(--ff-ui, inherit);
          white-space: nowrap;
        }
        .empresa-tab-icon {
          opacity: 0.55;
          transition: opacity 0.15s ease;
          flex-shrink: 0;
        }
        .empresa-subnav-tab:hover {
          color: var(--text);
        }
        .empresa-subnav-tab:hover .empresa-tab-icon {
          opacity: 0.85;
        }
        .empresa-subnav-tab--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
        .empresa-subnav-tab--active .empresa-tab-icon {
          opacity: 1;
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
          padding: 10px 0; border-bottom: 1px solid var(--border-light);
        }
        .info-row:last-child { border-bottom: none; }
        .info-row-icon { color: var(--text-muted); flex-shrink: 0; }
        .academy-settings-page-subtitle {
          margin: 8px 0 0;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          letter-spacing: 0.01em;
          text-transform: none;
          font-family: var(--ff-ui, inherit);
        }
        .info-row-label { font-size: 0.75rem; color: var(--text-muted); text-transform: none; letter-spacing: 0.02em; min-width: 70px; font-weight: 600; }
        .info-row-value { font-size: 0.9rem; color: var(--text); font-weight: 500; }
        .info-row-empty { font-size: 0.85rem; color: var(--text-muted); font-style: italic; }
        .action-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px; border-bottom: 1px solid var(--border-light);
          transition: var(--transition);
        }
        .action-row:last-child { border-bottom: none; }
        .action-row:hover { background: var(--surface-hover); }
        .action-icon {
          width: 40px; height: 40px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .btn-danger {
          background: var(--danger); color: white;
          border-radius: var(--radius-sm); font-weight: 700;
        }
        .confirm-overlay {
          position: fixed; inset: 0; background: rgba(18, 16, 42, 0.5);
          backdrop-filter: blur(4px); z-index: 200;
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: fadeIn 0.2s ease;
        }
        .confirm-modal {
          background: var(--surface); border-radius: var(--radius);
          padding: 24px; width: 100%; max-width: 360px; text-align: center;
          animation: fadeInUp 0.3s ease;
        }
        .confirm-icon-wrap {
          width: 56px; height: 56px; border-radius: 50%;
          background: var(--danger-light); margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
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
      `}} />
        </div>
    );
};

export default AcademySettings;
