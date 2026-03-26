import React, { useState, useEffect } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { databases, DB_ID, ACADEMIES_COL, teams } from '../lib/appwrite';
import { Building2, Phone, Mail, MapPin, Trash2, Download, ChevronRight, LogOut, Info, Plus, X } from 'lucide-react';
import ExportButton from '../components/ExportButton';

const Account = ({ user, onLogout }) => {
    const { leads } = useLeadStore();
    const academyId = useLeadStore((s) => s.academyId);

    const [academy, setAcademy] = useState({ name: '', phone: '', email: '', address: '', quickTimes: '', uiLabels: { leads: 'Leads', students: 'Alunos', classes: 'Aulas' }, modules: { sales: false, inventory: false, finance: false }, onboardingChecklist: [], customLeadQuestions: [] });
    const [editing, setEditing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [memberEmail, setMemberEmail] = useState('');
    const [memberRole, setMemberRole] = useState('viewer');
    const [inviting, setInviting] = useState(false);
    const [memberships, setMemberships] = useState([]);

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

    // Fetch academy data from Appwrite
    useEffect(() => {
        if (!academyId) return;
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(async (doc) => {
                let labels = { leads: 'Leads', students: 'Alunos', classes: 'Aulas' };
                let mods = { sales: false, inventory: false, finance: false };
                let checklist = [
                    { id: 'academy_info', title: 'Atualizar dados da academia', done: false },
                    { id: 'ui_labels', title: 'Definir rótulos (Aulas/Alunos/Leads)', done: false },
                    { id: 'quick_times', title: 'Adicionar horários rápidos', done: false },
                    { id: 'first_lead', title: 'Criar primeiro lead', done: false },
                    { id: 'install_pwa', title: 'Instalar atalho no celular', done: false }
                ];
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
                    if (doc.onboardingChecklist) {
                        const parsedCL = typeof doc.onboardingChecklist === 'string' ? JSON.parse(doc.onboardingChecklist) : doc.onboardingChecklist;
                        if (Array.isArray(parsedCL)) {
                            const byId = Object.fromEntries(parsedCL.map(i => [i.id, i]));
                            checklist = checklist.map(def => byId[def.id] ? { ...def, ...byId[def.id] } : def);
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
                    onboardingChecklist: checklist,
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
                try {
                    if (doc.teamId) {
                        const res = await teams.listMemberships({ teamId: doc.teamId });
                        setMemberships(res.memberships || []);
                    } else {
                        setMemberships([]);
                    }
                } catch { setMemberships([]); }
            })
            .catch(e => console.error('fetch academy:', e));
    }, [academyId]);

    const totalLeads = leads.length;
    const students = leads.filter(l => l.status === LEAD_STATUS.CONVERTED).length;
    const scheduled = leads.filter(l => l.status === LEAD_STATUS.SCHEDULED).length;

    const saveAcademy = async () => {
        if (!academyId) return;
        setSaving(true);
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
            setEditing(false);
        } catch (e) {
            console.error('save academy:', e);
        } finally {
            setSaving(false);
        }
    };

    const clearAllData = async () => {
        for (const lead of leads) {
            await useLeadStore.getState().deleteLead(lead.id);
        }
        setShowClearConfirm(false);
    };

    const inviteMember = async () => {
        if (!academy.teamId || !memberEmail) return;
        setInviting(true);
        try {
            await teams.createMembership({
                teamId: academy.teamId,
                email: memberEmail,
                roles: [memberRole],
                url: window.location.origin + '/welcome'
            });
            setMemberEmail('');
            try {
                const res = await teams.listMemberships({ teamId: academy.teamId });
                setMemberships(res.memberships || []);
            } catch (e) { void e; }
            alert('Convite enviado por e-mail.');
        } catch (e) {
            console.error('invite member:', e);
            alert('Não foi possível enviar o convite. Verifique o SMTP no Appwrite.');
        } finally {
            setInviting(false);
        }
    };

    const [newQuestion, setNewQuestion] = useState('');
    const saveQuestions = async (qs) => {
        if (!academyId) return;
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                customLeadQuestions: JSON.stringify(qs)
            });
            setAcademy(a => ({ ...a, customLeadQuestions: qs }));
        } catch (e) { console.error('save questions:', e); }
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <h2>Minha Conta</h2>
                <p className="text-small">Configurações da academia e do sistema</p>
            </div>

            {/* Academy Avatar */}
            <div className="account-hero card mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <div className="flex items-center gap-4">
                    <div className="account-avatar">
                        <Building2 size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1.15rem' }}>{academy.name || 'Minha Academia'}</h3>
                        <p className="text-small">{user?.email || 'Configure seus dados abaixo'}</p>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="stats-grid mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
                <div className="stat-card">
                    <span className="stat-number">{totalLeads}</span>
                    <span className="stat-label">{academy.uiLabels?.leads || 'Leads'}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{scheduled}</span>
                    <span className="stat-label">Agendados</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{students}</span>
                    <span className="stat-label">{academy.uiLabels?.students || 'Alunos'}</span>
                </div>
            </div>

            {/* Academy Info */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.12s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3>Checklist Inicial</h3>
                    <span className="text-small" style={{ color: 'var(--text-muted)' }}>
                        {`${(academy.onboardingChecklist || []).filter(i => i.done).length}/${(academy.onboardingChecklist || []).length || 0} concluídos`}
                    </span>
                </div>
                <div className="card">
                    <div className="flex-col gap-2">
                        {(academy.onboardingChecklist || []).map(item => (
                            <label key={item.id} className="info-row" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={!!item.done}
                                    onChange={async (e) => {
                                        const list = (academy.onboardingChecklist || []).map(it => it.id === item.id ? { ...it, done: e.target.checked } : it);
                                        setAcademy({ ...academy, onboardingChecklist: list });
                                        try {
                                            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { onboardingChecklist: JSON.stringify(list) });
                                        } catch (e) { void e; }
                                    }}
                                    style={{ marginRight: 10 }}
                                />
                                <span className="info-row-value">{item.title}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </section>

            {/* Custom Lead Questions */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.18s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3>Perguntas do Lead</h3>
                </div>
                <div className="card">
                    <div className="flex-col gap-3">
                        <div className="flex gap-2">
                            <input
                                className="form-input"
                                placeholder="Ex: Qual é seu objetivo principal?"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                            />
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    const q = (newQuestion || '').trim();
                                    if (!q) return;
                                    const qs = [...(academy.customLeadQuestions || []), { id: createId(), label: q, type: 'text' }];
                                    setNewQuestion('');
                                    saveQuestions(qs);
                                }}
                            >
                                <Plus size={16} /> Adicionar
                            </button>
                        </div>
                        <div className="flex-col gap-2">
                            {(academy.customLeadQuestions || []).map((q, idx) => (
                                <div key={`${q?.id || q?.label || idx}`} className="info-row">
                                    <div className="flex gap-2" style={{ flex: 1 }}>
                                        <input
                                            className="form-input"
                                            value={q?.label || ''}
                                            placeholder="Pergunta"
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const id = q?.id;
                                                setAcademy((a) => ({
                                                    ...a,
                                                    customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                        if (id && it?.id === id) return { ...it, label: value };
                                                        if (!id && i === idx) return { ...it, label: value };
                                                        return it;
                                                    }),
                                                }));
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        <select
                                            className="form-input"
                                            value={q?.type || 'text'}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const id = q?.id;
                                                setAcademy((a) => ({
                                                    ...a,
                                                    customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                        if (id && it?.id === id) return { ...it, type: value };
                                                        if (!id && i === idx) return { ...it, type: value };
                                                        return it;
                                                    }),
                                                }));
                                            }}
                                            style={{ maxWidth: 140 }}
                                        >
                                            <option value="text">Texto</option>
                                            <option value="number">Número</option>
                                            <option value="boolean">Sim/Não</option>
                                            <option value="select">Lista</option>
                                        </select>
                                        {(q?.type === 'select') && (
                                            <input
                                                className="form-input"
                                                value={Array.isArray(q?.options) ? q.options.join(', ') : (q?.options || '')}
                                                placeholder="Opções (separadas por vírgula)"
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
                                                    const id = q?.id;
                                                    setAcademy((a) => ({
                                                        ...a,
                                                        customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                            if (id && it?.id === id) return { ...it, options: arr };
                                                            if (!id && i === idx) return { ...it, options: arr };
                                                            return it;
                                                        }),
                                                    }));
                                                }}
                                                style={{ flex: 1 }}
                                            />
                                        )}
                                    </div>
                                    <button
                                        className="icon-btn"
                                        title="Remover"
                                        onClick={() => {
                                            const id = q?.id;
                                            const qs = id
                                                ? (academy.customLeadQuestions || []).filter((it) => it?.id !== id)
                                                : (academy.customLeadQuestions || []).filter((_, i) => i !== idx);
                                            saveQuestions(qs);
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            className="icon-btn"
                                            title="Mover para cima"
                                            onClick={() => {
                                                if (idx <= 0) return;
                                                const list = [...(academy.customLeadQuestions || [])];
                                                const [item] = list.splice(idx, 1);
                                                list.splice(idx - 1, 0, item);
                                                setAcademy((a) => ({ ...a, customLeadQuestions: list }));
                                            }}
                                        >
                                            <ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} />
                                        </button>
                                        <button
                                            className="icon-btn"
                                            title="Mover para baixo"
                                            onClick={() => {
                                                const list = [...(academy.customLeadQuestions || [])];
                                                if (idx >= list.length - 1) return;
                                                const [item] = list.splice(idx, 1);
                                                list.splice(idx + 1, 0, item);
                                                setAcademy((a) => ({ ...a, customLeadQuestions: list }));
                                            }}
                                        >
                                            <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {(academy.customLeadQuestions || []).length === 0 && (
                                <div className="text-small" style={{ color: 'var(--text-muted)' }}>
                                    Nenhuma pergunta configurada. Adicione perguntas personalizadas para acompanhar no perfil do lead.
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button
                                className="btn-secondary"
                                onClick={() => saveQuestions(academy.customLeadQuestions || [])}
                            >
                                Salvar alterações
                            </button>
                        </div>
                        <p className="text-xs text-light">As respostas são preenchidas no card do lead.</p>
                    </div>
                </div>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.15s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3>Dados da Academia</h3>
                    {!editing && (
                        <button className="edit-link" onClick={() => setEditing(true)}>Editar</button>
                    )}
                </div>

                <div className="card">
                    {editing ? (
                        <div className="flex-col gap-4">
                            <div className="form-group">
                                <label>Nome da Academia</label>
                                <input className="form-input" value={academy.name}
                                    onChange={e => setAcademy({ ...academy, name: e.target.value })}
                                    placeholder="Ex: Team BJJ" />
                            </div>
                            <div className="form-group">
                                <label>Telefone</label>
                                <input className="form-input" value={academy.phone}
                                    onChange={e => setAcademy({ ...academy, phone: e.target.value })}
                                    placeholder="(00) 00000-0000" />
                            </div>
                            <div className="form-group">
                                <label>E-mail</label>
                                <input className="form-input" type="email" value={academy.email}
                                    onChange={e => setAcademy({ ...academy, email: e.target.value })}
                                    placeholder="contato@academia.com" />
                            </div>
                            <div className="form-group">
                                <label>Endereço</label>
                                <input className="form-input" value={academy.address}
                                    onChange={e => setAcademy({ ...academy, address: e.target.value })}
                                    placeholder="Rua, número, bairro" />
                            </div>
                            <div className="form-group">
                                <label>Horários rápidos (reagendar)</label>
                                <input className="form-input" value={academy.quickTimes}
                                    onChange={e => setAcademy({ ...academy, quickTimes: e.target.value })}
                                    placeholder="Ex: 18:00, 19:00, 20:00" />
                                <p className="text-xs text-light">Separe por vírgulas. Exibidos nos cards de “Não Compareceu”.</p>
                            </div>
                            <div className="form-group">
                                <label>Rótulo para Leads (plural)</label>
                                <input className="form-input" value={academy.uiLabels.leads}
                                    onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, leads: e.target.value } })}
                                    placeholder="Ex: Leads" />
                            </div>
                            <div className="form-group">
                                <label>Rótulo para Alunos (plural)</label>
                                <input className="form-input" value={academy.uiLabels.students}
                                    onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, students: e.target.value } })}
                                    placeholder="Ex: Alunos" />
                            </div>
                            <div className="form-group">
                                <label>Rótulo para Aulas (plural)</label>
                                <input className="form-input" value={academy.uiLabels.classes}
                                    onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, classes: e.target.value } })}
                                    placeholder="Ex: Aulas" />
                            </div>
                            <div className="form-group">
                                <label>Módulos</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={!!academy.modules.sales} onChange={(e) => setAcademy({ ...academy, modules: { ...academy.modules, sales: e.target.checked } })} />
                                        <span className="text-small">Vendas</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={!!academy.modules.inventory} onChange={(e) => setAcademy({ ...academy, modules: { ...academy.modules, inventory: e.target.checked } })} />
                                        <span className="text-small">Estoque</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={!!academy.modules.finance} onChange={(e) => setAcademy({ ...academy, modules: { ...academy.modules, finance: e.target.checked } })} />
                                        <span className="text-small">Financeiro</span>
                                    </label>
                                </div>
                                <p className="text-xs text-light">Define módulos ativos apenas para esta academia.</p>
                            </div>
                            <div className="flex gap-2">
                                <button className="btn-outline" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>
                                <button className="btn-secondary" style={{ flex: 2 }} onClick={saveAcademy} disabled={saving}>
                                    {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-col gap-2">
                            <InfoRow icon={<Building2 size={16} />} label="Nome" value={academy.name} />
                            <InfoRow icon={<Phone size={16} />} label="Telefone" value={academy.phone} />
                            <InfoRow icon={<Mail size={16} />} label="E-mail" value={academy.email} />
                            <InfoRow icon={<MapPin size={16} />} label="Endereço" value={academy.address} />
                            <InfoRow icon={<ClockIcon />} label="Horários rápidos" value={academy.quickTimes} />
                            <div className="info-row">
                                <span className="info-row-label">Módulos</span>
                                <span className="info-row-value">{Object.entries(academy.modules || {}).filter(([,v]) => v).map(([k]) => k).join(', ') || 'Nenhum habilitado'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Actions */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="mb-2">Ações</h3>
                <div className="card flex-col" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="action-row">
                        <div className="flex items-center gap-4">
                            <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                <Download size={18} />
                            </div>
                            <div>
                                <strong>Exportar Todos os Dados</strong>
                                <p className="text-small">Baixe uma planilha com todos os leads</p>
                            </div>
                        </div>
                        <ExportButton leads={leads} fileName="bjj-crm-completo" label="Baixar" />
                    </div>

                    <div className="action-row" onClick={() => setShowClearConfirm(true)} style={{ cursor: 'pointer' }}>
                        <div className="flex items-center gap-4">
                            <div className="action-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                                <Trash2 size={18} />
                            </div>
                            <div>
                                <strong style={{ color: 'var(--danger)' }}>Limpar Todos os Dados</strong>
                                <p className="text-small">Remove todos os leads e alunos</p>
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>

                    <div className="action-row" onClick={onLogout} style={{ cursor: 'pointer' }}>
                        <div className="flex items-center gap-4">
                            <div className="action-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                                <LogOut size={18} />
                            </div>
                            <div>
                                <strong>Sair da Conta</strong>
                                <p className="text-small">{user?.email}</p>
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                </div>
            </section>

            {/* Team Management */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.22s' }}>
                <h3 className="mb-2">Equipe</h3>
                <div className="card">
                    {academy.teamId ? (
                        <div className="flex-col gap-3">
                            <div className="info-row">
                                <span className="info-row-label">Team ID</span>
                                <span className="info-row-value">{academy.teamId}</span>
                            </div>
                            <div className="form-group">
                                <label>Convidar por e-mail</label>
                                <div className="flex gap-2">
                                    <input className="form-input" type="email" placeholder="email@exemplo.com" value={memberEmail} onChange={e => setMemberEmail(e.target.value)} />
                                    <select className="form-input" value={memberRole} onChange={e => setMemberRole(e.target.value)}>
                                        <option value="viewer">viewer</option>
                                        <option value="editor">editor</option>
                                        <option value="owner">owner</option>
                                    </select>
                                    <button className="btn-secondary" onClick={inviteMember} disabled={inviting || !memberEmail}>Convidar</button>
                                </div>
                                <p className="text-xs text-light">É necessário SMTP configurado no Appwrite para envio do convite.</p>
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>Membros</label>
                                <div className="flex-col gap-1 mt-2">
                                    {(memberships || []).map(m => (
                                        <div key={m.$id} className="info-row">
                                            <span className="info-row-label">{m.userName || m.userId}</span>
                                            <span className="info-row-value">{(m.roles || []).join(', ')}</span>
                                        </div>
                                    ))}
                                    {(memberships || []).length === 0 && (
                                        <div className="text-small" style={{ color: 'var(--text-muted)' }}>Nenhum membro listado.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-small" style={{ color: 'var(--text-muted)' }}>
                            Nenhum time associado. Faça logout e login novamente para criar/associar automaticamente.
                        </div>
                    )}
                </div>
            </section>

            {/* System Info */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.25s' }}>
                <h3 className="mb-2">Sistema</h3>
                <div className="card">
                    <div className="flex items-center gap-4">
                        <Info size={16} color="var(--text-muted)" />
                        <div>
                            <p className="text-small" style={{ color: 'var(--text)' }}>FitGrow v2.0</p>
                            <p className="text-xs text-light">Dados armazenados na nuvem via Appwrite</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Clear Confirm Modal */}
            {showClearConfirm && (
                <div className="confirm-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-icon-wrap">
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h3>Limpar todos os dados?</h3>
                        <p className="text-small">Esta ação é irreversível. Todos os leads e alunos serão removidos.</p>
                        <div className="flex gap-2 mt-4">
                            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowClearConfirm(false)}>Cancelar</button>
                            <button className="btn-danger" style={{ flex: 1 }} onClick={clearAllData}>
                                <Trash2 size={16} /> Limpar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .account-hero { border-top: 4px solid var(--accent); }
        .account-avatar {
          width: 56px; height: 56px; border-radius: 16px;
          background: var(--accent-light); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .stat-card {
          background: var(--surface); border-radius: var(--radius);
          padding: 16px 12px; text-align: center;
          box-shadow: var(--shadow-sm); border: 1px solid var(--border-light);
          display: flex; flex-direction: column; gap: 2px;
        }
        .stat-number { font-size: 1.5rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
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
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
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
      `}} />
        </div>
    );
};

const ClockIcon = () => <span style={{ display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>⏱️</span>;

const InfoRow = ({ icon, label, value }) => (
    <div className="info-row">
        <span className="info-row-icon">{icon}</span>
        <span className="info-row-label">{label}</span>
        {value ? (
            <span className="info-row-value">{value}</span>
        ) : (
            <span className="info-row-empty">Não informado</span>
        )}
    </div>
);

export default Account;
