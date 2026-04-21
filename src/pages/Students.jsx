/** Backlog: aluno inativo/trancado; filtros (turma/plano); virtualização para listas muito longas. */
import React, { useState, useMemo, useEffect } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MessageCircle, ChevronRight, Upload, RefreshCw, SlidersHorizontal, ArrowUpDown, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { databases, DB_ID, LEADS_COL } from '../lib/appwrite';
import { Query } from 'appwrite';
import ImportSheet from '../components/ImportSheet';
import { StudentPanel } from '../components/StudentPanel';

function normalizePhone(v) {
    return String(v || '').replace(/\D/g, '');
}

function getBirthMonthDay(birthDate) {
    if (!birthDate) return null;
    const str = String(birthDate).trim();

    // Formato YYYY-MM-DD ou ISO timestamp
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[2]}-${isoMatch[3]}`; // MM-DD

    // Formato DD/MM/YYYY
    const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) return `${brMatch[2]}-${brMatch[1]}`; // MM-DD

    return null;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-BR');
}

const Students = () => {
    const navigate = useNavigate();
    const labels = useLeadStore((s) => s.labels);
    const updateLead = useLeadStore((s) => s.updateLead);
    const addToast = useUiStore((s) => s.addToast);
    const { leads, importLeads, fetchLeads, fetchMoreLeads, academyId } = useLeadStore();
    const leadsLoading = useLeadStore((s) => s.loading);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);
    const leadsError = useLeadStore((s) => s.leadsError);
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('Todos');
    const [filtroOrigem, setFiltroOrigem] = useState('Todas');
    const [ordenacao, setOrdenacao] = useState('az');
    const [showImport, setShowImport] = useState(false);
    const [listRefreshing, setListRefreshing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isNarrow, setIsNarrow] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 768
    );

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const onChange = () => setIsNarrow(mq.matches);
        mq.addEventListener('change', onChange);
        setIsNarrow(mq.matches);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const handlePanelSave = async (studentId, form) => {
        try {
            await updateLead(studentId, form);
            setSelectedStudent((prev) => (prev && prev.id === studentId ? { ...prev, ...form } : prev));
            addToast({ type: 'success', message: 'Salvo com sucesso.' });
        } catch {
            addToast({ type: 'error', message: 'Erro ao salvar. Tente novamente.' });
            throw new Error('SAVE_FAILED');
        }
    };

    const students = leads.filter((l) => l.status === LEAD_STATUS.CONVERTED || l.contact_type === 'student');

    const tiposUnicos = useMemo(() => {
        const tipos = students.map((s) => s.type).filter(Boolean);
        return ['Todos', ...new Set(tipos)].sort();
    }, [students]);

    const origensUnicas = useMemo(() => {
        const origens = students.map((s) => s.origin).filter(Boolean);
        return ['Todas', ...new Set(origens)].sort();
    }, [students]);

    const filteredStudents = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const qPhone = normalizePhone(searchTerm);

        return students
            .filter((s) => {
                const matchBusca =
                    (!q && !qPhone) ||
                    (qPhone && normalizePhone(s.phone || '').includes(qPhone)) ||
                    (q && String(s.name || '').toLowerCase().includes(q)) ||
                    (q && String(s.type || '').toLowerCase().includes(q));

                const matchTipo = filtroTipo === 'Todos' || s.type === filtroTipo;
                const matchOrigem = filtroOrigem === 'Todas' || s.origin === filtroOrigem;

                return matchBusca && matchTipo && matchOrigem;
            })
            .sort((a, b) => {
                const nA = a.name || '';
                const nB = b.name || '';
                const dA = a.createdAt || '';
                const dB = b.createdAt || '';
                if (ordenacao === 'az') return nA.localeCompare(nB, 'pt');
                if (ordenacao === 'za') return nB.localeCompare(nA, 'pt');
                if (ordenacao === 'recentes') return dB.localeCompare(dA);
                if (ordenacao === 'antigos') return dA.localeCompare(dB);
                return 0;
            });
    }, [students, searchTerm, filtroTipo, filtroOrigem, ordenacao]);

    const limparFiltros = () => {
        setSearchTerm('');
        setFiltroTipo('Todos');
        setFiltroOrigem('Todas');
        setOrdenacao('az');
    };

    const filtrosAtivos =
        Boolean(searchTerm.trim()) ||
        filtroTipo !== 'Todos' ||
        filtroOrigem !== 'Todas' ||
        ordenacao !== 'az';

    const handleImport = async (rows, skippedCount = 0) => {
        setImporting(true);
        const withStatus = rows.map((r) => ({
            ...r,
            status: LEAD_STATUS.CONVERTED,
            contact_type: 'student',
        }));
        try {
            await importLeads(withStatus);
            addToast({ type: 'success', message: `${rows.length} aluno(s) importado(s) com sucesso.` });
            if (skippedCount > 0) {
                addToast({ type: 'warning', message: `${skippedCount} linha(s) ignorada(s) por não ter nome preenchido.` });
            }
        } catch (e) {
            addToast({ type: 'error', message: 'Erro ao importar alunos.' });
        } finally {
            setImporting(false);
            setShowImport(false);
        }
    };

    const handleRefreshList = async () => {
        if (listRefreshing || leadsLoading) return;
        setListRefreshing(true);
        try {
            await fetchLeads({ reset: true });
        } finally {
            setListRefreshing(false);
        }
    };

    /** Mesmo critério da lista na UI: matriculado (status) ou contact_type aluno. */
    const fetchAllStudents = async (academyId) => {
        const base = [Query.equal('academyId', academyId), Query.limit(5000)];
        const [byStatus, byContact] = await Promise.all([
            databases.listDocuments(DB_ID, LEADS_COL, [...base, Query.equal('status', LEAD_STATUS.CONVERTED)]),
            databases.listDocuments(DB_ID, LEADS_COL, [...base, Query.equal('contact_type', 'student')]),
        ]);
        const map = new Map();
        for (const d of [...(byStatus.documents || []), ...(byContact.documents || [])]) {
            map.set(d.$id, d);
        }
        return [...map.values()];
    };

    const handleExportAll = async () => {
        if (!academyId) return;
        setExporting(true);
        try {
            const allStudents = await fetchAllStudents(academyId);

            if (allStudents.length === 0) {
                addToast({ type: 'warning', message: 'Nenhum aluno encontrado para exportar.' });
                return;
            }

            const data = allStudents.map(l => ({
                'Nome': l.name || '',
                'Telefone': l.phone || '',
                'Tipo': l.type || '',
                'Origem': l.origin || '',
                'Status': l.status || '',
                'Plano': l.plan || '',
                'Data Ingresso': l.enrollmentDate ? formatDate(l.enrollmentDate) : '',
                'Criado em': l.$createdAt ? new Date(l.$createdAt).toLocaleDateString('pt-BR') : '',
            }));

            const ws = XLSX.utils.json_to_sheet(data);

            const colWidths = Object.keys(data[0]).map(key => ({
                wch: Math.max(key.length, ...data.map(row => (row[key] || '').toString().length)) + 2
            }));
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Dados');
            XLSX.writeFile(wb, `alunos-ativos.xlsx`);
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Erro ao exportar alunos.' });
        } finally {
            setExporting(false);
        }
    };

    const handleLoadMore = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const studentLabel = labels.students || 'Alunos';
    const studentSingular = studentLabel.toLowerCase().endsWith('s') && studentLabel.length > 1
        ? studentLabel.slice(0, -1)
        : studentLabel;
    const pipelineName = labels.pipeline || 'Funil';

    // TODO: quando existir status inativo, adicionar filtro "Ativos/Inativos" aqui.
    const exportTooltip =
        'Exporta alunos com status Matriculado ou tipo de contato Aluno (mesmo critério da lista). Até 5000 por critério no servidor.';

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <header className="animate-in">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <h2 className="navi-page-title">{studentLabel}</h2>
                        <p className="navi-eyebrow" style={{ marginTop: 6 }}>
                            Total nesta lista:{' '}
                            <span className="navi-ui-count">{filteredStudents.length}</span>
                            {filtrosAtivos && students.length !== filteredStudents.length
                                ? ` (de ${students.length})`
                                : ''}
                            {leadsHasMore ? ' (parcial — há mais alunos no servidor)' : ''}
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            className="students-refresh-btn"
                            onClick={handleRefreshList}
                            disabled={listRefreshing || leadsLoading}
                            title="Recarregar lista do servidor"
                        >
                            <RefreshCw size={16} className={listRefreshing || leadsLoading ? 'spin-students' : ''} />
                            Atualizar
                        </button>
                        <button
                            type="button"
                            className="export-btn"
                            onClick={handleExportAll}
                            disabled={exporting}
                            title={exportTooltip}
                        >
                            <Download size={16} /> {exporting ? 'Exportando...' : 'Exportar'}
                        </button>
                        <button type="button" className="import-btn" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Importar
                        </button>
                    </div>
                </div>
            </header>

            {leadsError ? (
                <div className="dashboard-error-banner mt-3" role="alert">
                    <span>Não foi possível carregar os alunos.</span>
                    <button type="button" className="btn-secondary" onClick={() => void fetchLeads({ reset: true })}>
                        Tentar novamente
                    </button>
                </div>
            ) : null}

            <div
                className="students-split-wrap"
                style={{
                    display: 'flex',
                    gap: 0,
                    minHeight: 'min(70vh, calc(100vh - 220px))',
                    alignItems: 'stretch',
                }}
            >
            <div
                style={{
                    flex: selectedStudent && !isNarrow ? '0 0 55%' : '1',
                    transition: 'flex 0.2s ease',
                    overflowY: 'auto',
                    borderRight: selectedStudent && !isNarrow ? '1px solid var(--border)' : 'none',
                    minWidth: 0,
                }}
            >

            <div className="students-filters-card mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <div className="students-filters-card-head">
                    <div className="students-filters-card-title">
                        <SlidersHorizontal size={17} strokeWidth={2} className="students-filters-card-icon" aria-hidden />
                        <span>Busca e filtros</span>
                    </div>
                    {filtrosAtivos ? (
                        <button type="button" className="students-filters-clear" onClick={limparFiltros}>
                            <X size={15} strokeWidth={2.25} aria-hidden />
                            Limpar tudo
                        </button>
                    ) : null}
                </div>

                <div className="search-wrapper students-filters-search">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, celular ou perfil..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="students-filters-grid">
                    {tiposUnicos.length > 2 && (
                        <label className="students-filter-field">
                            <span className="students-filter-label">Perfil</span>
                            <select
                                value={filtroTipo}
                                onChange={(e) => setFiltroTipo(e.target.value)}
                                className="students-filter-select"
                            >
                                {tiposUnicos.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    {origensUnicas.length > 2 && (
                        <label className="students-filter-field">
                            <span className="students-filter-label">Origem</span>
                            <select
                                value={filtroOrigem}
                                onChange={(e) => setFiltroOrigem(e.target.value)}
                                className="students-filter-select"
                            >
                                {origensUnicas.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="students-filter-field">
                        <span className="students-filter-label">
                            <ArrowUpDown size={12} strokeWidth={2.5} className="students-filter-label-icon" aria-hidden />
                            Ordenar
                        </span>
                        <select
                            value={ordenacao}
                            onChange={(e) => setOrdenacao(e.target.value)}
                            className="students-filter-select"
                        >
                            <option value="az">Nome A → Z</option>
                            <option value="za">Nome Z → A</option>
                            <option value="recentes">Mais recentes</option>
                            <option value="antigos">Mais antigos</option>
                        </select>
                    </label>
                </div>

                {filtroTipo === 'Todos' && tiposUnicos.length > 2 && (
                    <div className="students-tipo-chips-wrap">
                        <span className="students-tipo-chips-hint">Atalho por perfil</span>
                        <div className="students-tipo-chips" role="group" aria-label="Filtrar por perfil">
                            {tiposUnicos
                                .filter((t) => t !== 'Todos')
                                .map((tipo) => {
                                    const count = students.filter((s) => s.type === tipo).length;
                                    return (
                                        <button
                                            key={tipo}
                                            type="button"
                                            className={`students-tipo-chip${filtroTipo === tipo ? ' students-tipo-chip--active' : ''}`}
                                            onClick={() => setFiltroTipo(tipo)}
                                        >
                                            <span>{tipo}</span>
                                            <span className="students-tipo-chip-count">{count}</span>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>

            {leadsHasMore ? (
                <div className="mt-3 animate-in">
                    <button
                        type="button"
                        className="students-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingMore || leadsLoading}
                    >
                        {loadingMore ? 'Carregando…' : 'Carregar mais alunos'}
                    </button>
                    <p className="text-xs text-light mt-1">
                        A lista de alunos usa os mesmos dados do servidor que o {pipelineName}. Carregue mais para incluir matriculados em registros antigos.
                    </p>
                </div>
            ) : null}

            {(() => {
                const hoje = new Date();
                const mesHoje = String(hoje.getMonth() + 1).padStart(2, '0');
                const diaHoje = String(hoje.getDate()).padStart(2, '0');
                const mesEDia = `${mesHoje}-${diaHoje}`;

                const aniversariantes = students.filter(
                    (s) => getBirthMonthDay(s.birthDate) === mesEDia
                );

                if (aniversariantes.length === 0) return null;

                return (
                    <div
                        style={{
                            margin: '16px 0',
                            padding: '12px 16px',
                            borderRadius: 12,
                            background: '#FFF7ED',
                            border: '1px solid #FED7AA',
                        }}
                    >
                        <p
                            style={{
                                margin: '0 0 8px',
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#9A3412',
                            }}
                        >
                            🎂 Aniversariantes hoje ({aniversariantes.length})
                        </p>
                        {aniversariantes.map((s) => (
                            <div
                                key={s.id}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedStudent(s);
                                    }
                                }}
                                onClick={() => setSelectedStudent(s)}
                                style={{
                                    fontSize: 13,
                                    color: '#7C2D12',
                                    padding: '3px 0',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <span>{s.name}</span>
                                <span style={{ color: '#9A3412', opacity: 0.7 }}>{s.type}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}

            <div className="flex-col gap-2 mt-4">
                {leadsLoading && students.length === 0 ? (
                    <div className="students-skeleton-list mt-4" role="status" aria-live="polite" aria-busy="true">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="card student-card students-skeleton-row" style={{ height: 72 }} />
                        ))}
                    </div>
                ) : students.length === 0 ? (
                    <div
                        className="card students-empty-root mt-4 animate-in"
                        style={{
                            textAlign: 'center',
                            padding: '48px 16px',
                            color: 'var(--text-muted)',
                        }}
                    >
                        {filtrosAtivos ? (
                            <>
                                <p style={{ marginBottom: 12 }}>
                                    Nenhum {studentSingular.toLowerCase()} encontrado com esses filtros.
                                </p>
                                <button
                                    type="button"
                                    onClick={limparFiltros}
                                    style={{
                                        color: 'var(--purple)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        textDecoration: 'underline',
                                    }}
                                >
                                    Limpar filtros
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="navi-section-heading" style={{ marginBottom: 8, color: 'var(--text)' }}>
                                    Nenhum {studentSingular.toLowerCase()} matriculado ainda.
                                </p>
                                <p className="text-small" style={{ marginBottom: 20, lineHeight: 1.5, maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
                                    Matrículas são feitas pelo {pipelineName} — mova um contato para o status &quot;{LEAD_STATUS.CONVERTED}&quot;.
                                </p>
                                <button type="button" className="btn-primary" onClick={() => navigate('/pipeline')}>
                                    Ir para o {pipelineName}
                                </button>
                            </>
                        )}
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div
                        className="mt-4 animate-in"
                        style={{
                            textAlign: 'center',
                            padding: '48px 16px',
                            color: 'var(--text-muted)',
                        }}
                    >
                        <p style={{ marginBottom: 12 }}>
                            Nenhum {studentSingular.toLowerCase()} encontrado com esses filtros.
                        </p>
                        <button
                            type="button"
                            onClick={limparFiltros}
                            style={{
                                color: 'var(--purple)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 14,
                                textDecoration: 'underline',
                            }}
                        >
                            Limpar filtros
                        </button>
                    </div>
                ) : (
                    filteredStudents.map((student, i) => {
                        const digits = normalizePhone(student.phone);
                        return (
                            <div
                                key={student.id}
                                className="card student-card animate-in"
                                style={{ animationDelay: `${0.03 * i}s` }}
                            >
                                <div className="flex justify-between items-center">
                                    <div
                                        className="student-card-main"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSelectedStudent(student);
                                            }
                                        }}
                                        onClick={() => setSelectedStudent(student)}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            border: 'none',
                                            background: 'none',
                                            padding: 0,
                                            font: 'inherit',
                                            color: 'inherit',
                                        }}
                                    >
                                        <strong style={{ fontSize: '0.95rem' }}>{student.name || 'Sem nome'}</strong>
                                        <p className="text-small" style={{ margin: 0 }}>
                                            {[student.type, student.phone].filter((p) => p && String(p).trim()).join(' • ') || '—'}
                                        </p>
                                        {(student.plan || student.enrollmentDate) && (
                                            <div className="student-card-meta" style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {student.plan && (
                                                    <span className="student-meta-item">
                                                        📋 {student.plan}
                                                    </span>
                                                )}
                                                {student.enrollmentDate && (
                                                    <span className="student-meta-item">
                                                        📅 Desde {formatDate(student.enrollmentDate)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 student-card-actions">
                                        {digits ? (
                                            <Link
                                                to={`/inbox?phone=${encodeURIComponent(digits)}`}
                                                className="student-inbox-link students-touch-hit"
                                                draggable={false}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Atendimento
                                            </Link>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="quick-action-btn students-touch-hit"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`https://wa.me/55${digits}`, '_blank');
                                            }}
                                            disabled={!digits}
                                            title="WhatsApp"
                                        >
                                            <MessageCircle size={16} color="#25D366" />
                                        </button>
                                        <Link
                                            to={`/lead/${student.id}`}
                                            className="student-profile-chevron students-touch-hit"
                                            onClick={(e) => e.stopPropagation()}
                                            title="Perfil completo"
                                            aria-label="Abrir perfil completo"
                                        >
                                            <ChevronRight size={16} color="var(--text-muted)" />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            </div>

            {selectedStudent && !isNarrow ? (
                <div
                    style={{
                        flex: '0 0 45%',
                        overflow: 'hidden',
                        background: 'var(--surface)',
                        padding: 24,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        boxSizing: 'border-box',
                    }}
                >
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <StudentPanel
                            student={selectedStudent}
                            onClose={() => setSelectedStudent(null)}
                            onSave={handlePanelSave}
                            isNarrow={isNarrow}
                        />
                    </div>
                </div>
            ) : null}
            </div>

            {selectedStudent && isNarrow ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 50,
                        background: 'var(--surface)',
                        overflow: 'hidden',
                        padding: 24,
                        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        boxSizing: 'border-box',
                    }}
                >
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <StudentPanel
                            student={selectedStudent}
                            onClose={() => setSelectedStudent(null)}
                            onSave={handlePanelSave}
                            isNarrow={isNarrow}
                        />
                    </div>
                </div>
            ) : null}

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.CONVERTED}
                title="Importar Alunos"
                importing={importing}
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes studentsSkeletonShimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .dashboard-error-banner {
          display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 10px;
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.35);
          color: var(--text);
          font-size: 0.9rem;
        }
        .students-skeleton-row {
          border-left: 4px solid var(--border);
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: studentsSkeletonShimmer 1.2s ease-in-out infinite;
        }
        .search-wrapper { position: relative; }
        .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .search-input { 
          width: 100%; padding: 14px 16px 14px 44px; border-radius: var(--radius-sm); 
          border: 1.5px solid var(--border); font-size: 0.95rem; background: var(--surface);
          outline: none; transition: var(--transition); color: var(--text);
        }
        .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }

        .students-filters-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
          padding: 16px 18px 18px;
        }
        .students-filters-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .students-filters-card-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .students-filters-card-icon { color: var(--accent); flex-shrink: 0; }
        .students-filters-clear {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-full);
          border: none;
          background: var(--accent-light);
          color: var(--accent);
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition);
        }
        .students-filters-clear:hover { filter: brightness(0.97); box-shadow: 0 1px 0 var(--border); }
        .students-filters-search { margin-bottom: 14px; }
        .students-filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px 14px;
          align-items: end;
        }
        .students-filter-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin: 0;
          min-width: 0;
        }
        .students-filter-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }
        .students-filter-label-icon { color: var(--accent); flex-shrink: 0; }
        .students-filter-select {
          width: 100%;
          min-height: 42px;
          padding: 0 36px 0 12px;
          border-radius: var(--radius-sm);
          border: 1.5px solid var(--border);
          background-color: var(--surface);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b6b88' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          color: var(--text);
          font-size: 0.875rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          transition: var(--transition);
        }
        .students-filter-select:hover { border-color: var(--border-mid); }
        .students-filter-select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-light);
        }
        .students-tipo-chips-wrap {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border-light);
        }
        .students-tipo-chips-hint {
          display: block;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 10px;
        }
        .students-tipo-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .students-tipo-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px 8px 14px;
          border-radius: var(--radius-full);
          border: 1.5px solid var(--border);
          background: var(--surface-hover);
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: var(--transition);
        }
        .students-tipo-chip:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-light);
        }
        .students-tipo-chip-count {
          min-width: 1.5rem;
          padding: 2px 7px;
          border-radius: var(--radius-full);
          background: var(--surface);
          border: 1px solid var(--border);
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--text-muted);
        }
        .students-tipo-chip:hover .students-tipo-chip-count {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-light);
        }
        .students-tipo-chip--active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }
        .students-tipo-chip--active .students-tipo-chip-count {
          background: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.35);
          color: #fff;
        }
        .student-card { 
          padding: 16px 16px; 
          border-left: 4px solid var(--purple); 
          transition: var(--transition);
        }
        .student-card:hover { box-shadow: var(--shadow); }
        .student-profile-chevron {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: var(--text-muted);
        }
        .student-profile-chevron:hover { background: var(--border-light); color: var(--accent); }
        .student-inbox-link {
          font-size: 0.72rem; font-weight: 700; color: var(--accent);
          text-decoration: none; margin-right: 2px;
        }
        .student-inbox-link:hover { text-decoration: underline; }
        .student-card .students-touch-hit {
          min-width: 44px;
          min-height: 44px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .student-card .student-inbox-link.students-touch-hit {
          padding: 0 10px;
          border-radius: 10px;
        }
        .student-card .student-profile-chevron.students-touch-hit {
          border-radius: 12px;
        }
        .quick-action-btn {
          border-radius: 50%;
          background: var(--border-light); padding: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .quick-action-btn:hover:not(:disabled) { background: var(--border); }
        .quick-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .import-btn {
          background: var(--accent); color: white; padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px;
        }
        .import-btn:hover { filter: brightness(1.1); }
        .students-refresh-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--surface); border: 1.5px solid var(--border);
          color: var(--text-secondary); padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
        }
        .students-refresh-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .students-refresh-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .spin-students { animation: studentsSpin 0.7s linear infinite; }
        @keyframes studentsSpin { to { transform: rotate(360deg); } }
        .export-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--surface); border: 1.5px solid var(--border);
          color: var(--text-secondary); padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          transition: var(--transition);
        }
        .export-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .students-load-more {
          background: var(--surface-hover); border: 1px solid var(--border);
          color: var(--text-secondary); padding: 8px 14px; border-radius: var(--radius-sm);
          font-size: 0.82rem; font-weight: 700;
        }
        .students-load-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .students-load-more:disabled { opacity: 0.6; cursor: not-allowed; }
      `}} />
        </div>
    );
};

export default Students;
