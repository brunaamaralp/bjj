import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { ChevronLeft } from 'lucide-react';
import GeralSection from '../components/academy/GeralSection';
import AtendimentoSection from '../components/academy/AtendimentoSection';
import PersonalizacaoSection from '../components/academy/PersonalizacaoSection';
import GerenciamentoSection from '../components/academy/GerenciamentoSection';

const TABS = [
    { id: 'geral', label: 'Geral' },
    { id: 'atendimento', label: 'Atendimento' },
    { id: 'personalizacao', label: 'Personalização' },
    { id: 'gerenciamento', label: 'Gerenciamento' },
];

const AcademySettings = () => {
    const { leads } = useLeadStore();
    const academyId = useLeadStore((s) => s.academyId);
    const addToast = useUiStore((s) => s.addToast);

    const [activeTab, setActiveTab] = useState('geral');
    const [academy, setAcademy] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        quickTimes: '',
        uiLabels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas', pipeline: 'Funil' },
        modules: { sales: false, inventory: false, finance: false },
        customLeadQuestions: [],
        teamId: ''
    });

    const createId = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch { void 0; }
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
        if (!academyId) return;
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(async (doc) => {
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
                } catch (e) { void e; }
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
                    customLeadQuestions: normalized.questions,
                });
                if (normalized.migrated) {
                    try {
                        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                            customLeadQuestions: JSON.stringify(normalized.questions)
                        });
                    } catch (e) { void e; }
                }
            })
            .catch(e => console.error('fetch academy:', e));
    }, [academyId]);

    const handleSave = async () => {
        if (!academyId) return;
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                name: academy.name,
                phone: academy.phone,
                email: academy.email,
                address: academy.address,
                quickTimes: academy.quickTimes || '',
                uiLabels: JSON.stringify(academy.uiLabels || {}),
                modules: JSON.stringify(academy.modules || {}),
            });
            try {
                useLeadStore.getState().setLabels(academy.uiLabels || {});
                useLeadStore.getState().setModules(academy.modules || {});
            } catch (e) { void e; }
            addToast({ type: 'success', message: 'Configurações da academia salvas.' });
        } catch (e) {
            console.error('save academy:', e);
            addToast({ type: 'error', message: 'Não foi possível salvar as configurações.' });
            throw e;
        }
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <Link
                    to="/conta"
                    className="edit-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none' }}
                >
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                    Voltar à conta
                </Link>
                <h2 className="navi-page-title">Minha academia</h2>
                <p className="navi-eyebrow" style={{ marginTop: 6 }}>Integrações, agente de IA, funil e dados do seu estúdio</p>
            </div>

            <nav className="empresa-subnav" aria-label="Seções da academia">
                <div className="empresa-subnav-scroll">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`empresa-subnav-tab ${activeTab === tab.id ? 'empresa-subnav-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            {activeTab === 'geral' && (
                <GeralSection academy={academy} setAcademy={setAcademy} onSave={handleSave} />
            )}
            
            {activeTab === 'atendimento' && (
                <AtendimentoSection academy={academy} />
            )}
            
            {activeTab === 'personalizacao' && (
                <PersonalizacaoSection academy={academy} setAcademy={setAcademy} onSave={handleSave} academyId={academyId} />
            )}
            
            {activeTab === 'gerenciamento' && (
                <GerenciamentoSection academy={academy} leads={leads} />
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .empresa-section { scroll-margin-top: 52px; }
        .empresa-subnav {
          position: sticky;
          top: 0;
          z-index: 8;
          margin: 4px -6px 14px;
          padding: 6px 6px 10px;
          background: linear-gradient(180deg, var(--bg) 0%, var(--bg) 72%, rgba(246, 244, 255, 0) 100%);
          border-bottom: 1px solid var(--border-light);
        }
        .empresa-subnav-scroll {
          display: flex;
          flex-wrap: nowrap;
          gap: 6px;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--v100) transparent;
          padding-bottom: 2px;
        }
        .empresa-subnav-scroll::-webkit-scrollbar { height: 4px; }
        .empresa-subnav-scroll::-webkit-scrollbar-thumb {
          background: var(--v100);
          border-radius: 4px;
        }
        .empresa-subnav-tab {
          flex: 0 0 auto;
          padding: 6px 12px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          border-radius: 999px;
          border: 1px solid var(--border-light);
          background: var(--surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition);
          font-family: var(--ff-ui, inherit);
        }
        .empresa-subnav-tab:hover {
          border-color: var(--v200);
          color: var(--text);
          background: var(--surface-hover);
        }
        .empresa-subnav-tab--active {
          background: var(--accent-light);
          color: var(--accent);
          border-color: rgba(91, 63, 191, 0.22);
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
        .info-row-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; min-width: 70px; }
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
      `}} />
        </div>
    );
};

export default AcademySettings;
