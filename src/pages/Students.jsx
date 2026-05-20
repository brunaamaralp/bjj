/** Backlog: filtros (turma/plano); virtualização para listas muito longas. */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MessageCircle, ChevronRight, ChevronDown, Upload, RefreshCw, Download, UserPlus, X } from 'lucide-react';

const STUDENTS_FILTERS_EXPANDED_KEY = 'navi_students_filters_expanded';
import { databases, DB_ID, STUDENTS_COL } from '../lib/appwrite';
import useDebounce from '../hooks/useDebounce';
import { Query } from 'appwrite';
import ImportSheet from '../components/ImportSheet';
import PlanSelect from '../components/shared/PlanSelect.jsx';
import { prefetchFinanceConfig } from '../lib/prefetchFinanceConfig.js';
import { normalizeLeadProfileType, isCriancaProfileType } from '../../lib/leadTypeNormalize.js';
import { useTerms } from '../lib/terminology.js';
import { filterStudentsByStatus, STUDENT_STATUS } from '../lib/studentStatus.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import ControlIdSyncBadge from '../components/student/ControlIdSyncBadge.jsx';

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
    const terms = useTerms();
    const addToast = useUiStore((s) => s.addToast);
    const { students, importStudents, fetchStudents, fetchMoreStudents, addStudent } = useStudentStore();
    const academyId = useLeadStore((s) => s.academyId);
    const financeConfig = useLeadStore((s) => s.financeConfig);

    useEffect(() => {
        if (academyId) void prefetchFinanceConfig(academyId);
    }, [academyId]);
    const { turmas: turmasConfig } = useAcademyTurmas(academyId);
    const controlIdCfg = useAcademyControlId(academyId);
    const studentsLoading = useStudentStore((s) => s.loading);
    const loadingMore = useStudentStore((s) => s.loadingMore);
    const studentsHasMore = useStudentStore((s) => s.studentsHasMore);
    const studentsError = useStudentStore((s) => s.studentsError);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 200);
    const listScrollRef = useRef(null);
    const [filtroTipo, setFiltroTipo] = useState('Todos');
    const [filtroOrigem, setFiltroOrigem] = useState('Todas');
    const [filtroTurma, setFiltroTurma] = useState('Todas');
    const [ordenacao, setOrdenacao] = useState('az');
    const [showImport, setShowImport] = useState(false);
    const [showCreateStudent, setShowCreateStudent] = useState(false);
    const [listRefreshing, setListRefreshing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [creatingStudent, setCreatingStudent] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [filtersExpanded, setFiltersExpanded] = useState(() => {
        try {
            return sessionStorage.getItem(STUDENTS_FILTERS_EXPANDED_KEY) === '1';
        } catch {
            return false;
        }
    });
    const [newStudent, setNewStudent] = useState({
        name: '',
        phone: '',
        type: 'Adulto',
        origin: LEAD_ORIGIN[0] || 'Cadastro manual',
        parentName: '',
        age: '',
        plan: '',
    });

    const statusFilteredStudents = useMemo(
        () => filterStudentsByStatus(students, showInactive),
        [students, showInactive]
    );

    const filteredStudents = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        const qPhone = normalizePhone(debouncedSearch);

        return statusFilteredStudents
            .filter((s) => {
                const matchBusca =
                    (!q && !qPhone) ||
                    (qPhone && normalizePhone(s.phone || '').includes(qPhone)) ||
                    (q && String(s.name || '').toLowerCase().includes(q)) ||
                    (q && String(s.type || '').toLowerCase().includes(q));

                const matchTipo =
                    filtroTipo === 'Todos'
                    || (filtroTipo === 'Criança' ? isCriancaProfileType(s.type) : s.type === filtroTipo);
                const matchOrigem = filtroOrigem === 'Todas' || s.origin === filtroOrigem;
                const turmaVal = String(s.turma || s.className || '').trim();
                const matchTurma =
                    filtroTurma === 'Todas' || (filtroTurma === 'Sem turma' ? !turmaVal : turmaVal === filtroTurma);

                return matchBusca && matchTipo && matchOrigem && matchTurma;
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
    }, [statusFilteredStudents, debouncedSearch, filtroTipo, filtroOrigem, filtroTurma, ordenacao]);

    const shouldVirtualizeStudents = filteredStudents.length > 50;
    const studentVirtualizer = useVirtualizer({
        count: shouldVirtualizeStudents ? filteredStudents.length : 0,
        getScrollElement: () => listScrollRef.current,
        estimateSize: () => 88,
        overscan: 8,
    });

    const limparFiltros = () => {
        setSearchTerm('');
        setFiltroTipo('Todos');
        setFiltroOrigem('Todas');
        setFiltroTurma('Todas');
        setOrdenacao('az');
        setShowInactive(false);
    };

    const filtrosAtivos =
        Boolean(searchTerm.trim()) ||
        filtroTipo !== 'Todos' ||
        filtroOrigem !== 'Todas' ||
        filtroTurma !== 'Todas' ||
        ordenacao !== 'az' ||
        showInactive;

    const collapsibleFilterCount = useMemo(() => {
        let n = 0;
        if (filtroTipo !== 'Todos') n += 1;
        if (filtroOrigem !== 'Todas') n += 1;
        if (filtroTurma !== 'Todas') n += 1;
        if (ordenacao !== 'az') n += 1;
        return n;
    }, [filtroTipo, filtroOrigem, filtroTurma, ordenacao]);

    useEffect(() => {
        try {
            sessionStorage.setItem(STUDENTS_FILTERS_EXPANDED_KEY, filtersExpanded ? '1' : '0');
        } catch {
            /* ignore */
        }
    }, [filtersExpanded]);

    const studentPlural = terms.students;
    const studentSingular = terms.student;

    const handleImport = async (rows, skippedCount = 0) => {
        setImporting(true);
        const withStatus = rows.map((r) => ({
            ...r,
            studentStatus: STUDENT_STATUS.ACTIVE,
        }));
        try {
            await importStudents(withStatus);
            addToast({ type: 'success', message: `${rows.length} ${terms.student.toLowerCase()}(s) importado(s) com sucesso.` });
            if (skippedCount > 0) {
                addToast({ type: 'warning', message: `${skippedCount} linha(s) ignorada(s) por não ter nome preenchido.` });
            }
        } catch {
            addToast({ type: 'error', message: `Erro ao importar ${terms.students.toLowerCase()}.` });
        } finally {
            setImporting(false);
            setShowImport(false);
        }
    };

    const resetNewStudentForm = () => {
        setNewStudent({
            name: '',
            phone: '',
            type: 'Adulto',
            origin: LEAD_ORIGIN[0] || 'Cadastro manual',
            parentName: '',
            age: '',
            plan: '',
        });
    };

    const handleCreateStudent = async (e) => {
        e.preventDefault();
        if (creatingStudent) return;
        const name = String(newStudent.name || '').trim();
        if (!name) {
            addToast({ type: 'warning', message: `Informe o nome do ${terms.student.toLowerCase()}.` });
            return;
        }
        setCreatingStudent(true);
        try {
            const cleanPhone = normalizePhone(newStudent.phone);
            const created = await addStudent({
                name,
                phone: cleanPhone,
                type: normalizeLeadProfileType(newStudent.type || 'Adulto') || 'Adulto',
                origin: newStudent.origin || 'Cadastro manual',
                parentName: String(newStudent.parentName || '').trim(),
                age: String(newStudent.age || '').trim(),
                plan: String(newStudent.plan || '').trim(),
                dueDay: new Date().getDate(),
                enrollmentDate: new Date().toISOString().slice(0, 10),
                studentStatus: STUDENT_STATUS.ACTIVE,
            });
            addToast({ type: 'success', message: `${terms.student} cadastrado com sucesso.` });
            setShowCreateStudent(false);
            resetNewStudentForm();
            if (created?.id) navigate(`/student/${created.id}`);
        } catch (err) {
            addToast({ type: 'error', message: err?.message || `Erro ao cadastrar ${terms.student.toLowerCase()}.` });
        } finally {
            setCreatingStudent(false);
        }
    };

    const handleRefreshList = async () => {
        if (listRefreshing || studentsLoading) return;
        setListRefreshing(true);
        try {
            await fetchStudents({ reset: true });
        } finally {
            setListRefreshing(false);
        }
    };

    const fetchAllStudents = async (academyId) => {
        if (!STUDENTS_COL) return [];
        const base = [Query.equal('academyId', academyId), Query.limit(5000)];
        const res = await databases.listDocuments(DB_ID, STUDENTS_COL, base);
        return res.documents || [];
    };

    const handleExportAll = async () => {
        if (!academyId) return;
        setExporting(true);
        try {
            const allStudents = await fetchAllStudents(academyId);

            if (allStudents.length === 0) {
                addToast({ type: 'warning', message: `Nenhum ${terms.student.toLowerCase()} encontrado para exportar.` });
                return;
            }

            const XLSX = await import('xlsx');

            const data = allStudents.map((l) => ({
                'Nome': l.name || '',
                'Telefone': l.phone || '',
                'Tipo': normalizeLeadProfileType(l.type) || l.type || '',
                'Origem': l.origin || '',
                'Status operacional': l.status || '',
                'Situação aluno': l.student_status || l.studentStatus || 'active',
                'Motivo saída': l.exit_reason || l.exitReason || '',
                'Data saída': l.exit_date || l.exitDate ? formatDate(l.exit_date || l.exitDate) : '',
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
            const exportSlug = terms.students
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, '-');
            XLSX.writeFile(wb, `${exportSlug}-ativos.xlsx`);
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: `Erro ao exportar ${terms.students.toLowerCase()}.` });
        } finally {
            setExporting(false);
        }
    };

    const handleLoadMore = async () => {
        if (loadingMore || studentsLoading || !studentsHasMore) return;
        await fetchMoreStudents();
    };

    const studentLabel = terms.students;
    const pipelineName = labels.pipeline || 'Funil';

    const exportTooltip = terms.exportStudentsTooltip
        .replace(/\{students\}/g, studentPlural.toLowerCase())
        .replace(/\{student\}/g, terms.student);

    const renderStudentCard = (student, animIndex = 0) => {
        const digits = normalizePhone(student.phone);
        return (
            <div
                className="card student-card animate-in"
                style={shouldVirtualizeStudents ? { marginBottom: 8 } : { animationDelay: `${0.03 * animIndex}s` }}
            >
                <div className="flex justify-between items-center">
                    <div
                        className="student-card-main"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/student/${student.id}`);
                            }
                        }}
                        onClick={() => navigate(`/student/${student.id}`)}
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
                        <strong style={{ fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {student.name || 'Sem nome'}
                            {String(student.freeze_status || '') === 'active' ? (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: '2px 7px',
                                        borderRadius: 6,
                                        background: '#e8eef5',
                                        color: '#475569',
                                    }}
                                >
                                    Trancado
                                </span>
                            ) : null}
                        </strong>
                        <p className="text-small" style={{ margin: 0 }}>
                            {[normalizeLeadProfileType(student.type) || student.type, student.phone]
                                .filter((p) => p && String(p).trim())
                                .join(' • ') || '—'}
                        </p>
                        {controlIdCfg.enabled && (
                            <ControlIdSyncBadge academyId={academyId} student={student} />
                        )}
                        {(student.plan || student.enrollmentDate) && (
                            <div
                                className="student-card-meta"
                                style={{
                                    display: 'flex',
                                    gap: '12px',
                                    marginTop: '4px',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {student.plan && <span className="student-meta-item">📋 {student.plan}</span>}
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
                            to={`/student/${student.id}`}
                            className="student-profile-chevron students-touch-hit"
                            onClick={(e) => e.stopPropagation()}
                            title={`Perfil do ${studentSingular.toLowerCase()}`}
                            aria-label={`Abrir perfil do ${studentSingular.toLowerCase()}`}
                        >
                            <ChevronRight size={16} color="var(--text-muted)" />
                        </Link>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <header className="animate-in">
                <h1 className="navi-page-title">{studentLabel}</h1>
                <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 14 }}>
                    <span className="navi-ui-count">{filteredStudents.length}</span> {studentPlural.toLowerCase()} cadastrados
                    {filtrosAtivos && students.length !== filteredStudents.length
                        ? ` (de ${students.length})`
                        : ''}
                    {studentsHasMore ? ` (parcial — há mais ${studentPlural.toLowerCase()} no servidor)` : ''}
                </p>
                <div className="page-header-card students-page-header">
                    <div className="page-header-row students-header-row-search">
                        <div className="page-header-search students-header-search">
                            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Buscar nome ou telefone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="students-header-actions">
                        <button
                            type="button"
                            className="btn-action-ghost"
                            onClick={handleRefreshList}
                            disabled={listRefreshing || studentsLoading}
                            title="Recarregar lista do servidor"
                        >
                            <RefreshCw size={14} className={listRefreshing || studentsLoading ? 'spin-students' : ''} />
                            Atualizar
                        </button>
                        <button
                            type="button"
                            className="btn-action-ghost"
                            onClick={handleExportAll}
                            disabled={!academyId || exporting}
                            title={exportTooltip}
                        >
                            <Download size={14} /> {exporting ? 'Exportando...' : 'Exportar'}
                        </button>
                        <button type="button" className="btn-action-ghost" onClick={() => setShowCreateStudent(true)}>
                            <UserPlus size={14} /> Cadastrar {studentSingular.toLowerCase()}
                        </button>
                        <button type="button" className="btn-action-primary" onClick={() => setShowImport(true)}>
                            <Upload size={14} /> Importar
                        </button>
                        </div>
                    </div>
                    <div className="students-mobile-filter-bar">
                        <button
                            type="button"
                            className="students-filters-toggle"
                            onClick={() => setFiltersExpanded((v) => !v)}
                            aria-expanded={filtersExpanded}
                        >
                            Filtros
                            {collapsibleFilterCount > 0
                                ? ` (${collapsibleFilterCount} ativo${collapsibleFilterCount > 1 ? 's' : ''})`
                                : ''}
                            <ChevronDown
                                size={14}
                                className={`students-filters-toggle__chev${filtersExpanded ? ' students-filters-toggle__chev--open' : ''}`}
                                aria-hidden
                            />
                        </button>
                        {filtrosAtivos ? (
                            <button type="button" className="students-filters-clear-mobile" onClick={limparFiltros}>
                                Limpar
                            </button>
                        ) : null}
                    </div>
                    <div className={`students-mobile-filters-panel${filtersExpanded ? ' is-open' : ''}`}>
                        <div className="students-mobile-filters-chips">
                            <span
                                className={`date-chip${!showInactive ? ' active' : ''}`}
                                onClick={() => setShowInactive(false)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setShowInactive(false);
                                    }
                                }}
                            >
                                Ativos
                            </span>
                            <span
                                className={`date-chip${showInactive ? ' active' : ''}`}
                                onClick={() => setShowInactive(true)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setShowInactive(true);
                                    }
                                }}
                            >
                                Inativos
                            </span>
                        </div>
                        <div className="filter-group students-mobile-filter-group">
                            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                                <option value="Todos">Todos os perfis</option>
                                <option value="Adulto">Adulto</option>
                                <option value="Criança">Criança</option>
                                <option value="Juniores">Juniores</option>
                            </select>
                            <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
                                <option value="Todas">Todas as origens</option>
                                {LEAD_ORIGIN.map((o) => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                            <select value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
                                <option value="Todas">Todas as turmas</option>
                                <option value="Sem turma">Sem turma</option>
                                {turmasConfig.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <select
                            className="students-mobile-sort"
                            value={ordenacao}
                            onChange={(e) => setOrdenacao(e.target.value)}
                        >
                            <option value="az">Nome A-Z</option>
                            <option value="za">Nome Z-A</option>
                            <option value="recentes">Mais recente</option>
                        </select>
                    </div>
                    <div className="page-header-row students-header-row-filters">
                        <span
                            className={`date-chip${!showInactive ? ' active' : ''}`}
                            onClick={() => setShowInactive(false)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setShowInactive(false);
                                }
                            }}
                        >
                            Ativos
                        </span>
                        <span
                            className={`date-chip${showInactive ? ' active' : ''}`}
                            onClick={() => setShowInactive(true)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setShowInactive(true);
                                }
                            }}
                        >
                            Inativos
                        </span>
                        <div className="filter-group">
                            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                                <option value="Todos">Todos os perfis</option>
                                <option value="Adulto">Adulto</option>
                                <option value="Criança">Criança</option>
                                <option value="Juniores">Juniores</option>
                            </select>
                            <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
                                <option value="Todas">Todas as origens</option>
                                {LEAD_ORIGIN.map((o) => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                            <select value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
                                <option value="Todas">Todas as turmas</option>
                                <option value="Sem turma">Sem turma</option>
                                {turmasConfig.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <select
                            value={ordenacao}
                            onChange={(e) => setOrdenacao(e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 12, border: '0.5px solid var(--border-light)', borderRadius: 8, color: 'var(--text-secondary)' }}
                        >
                            <option value="az">Nome A-Z</option>
                            <option value="za">Nome Z-A</option>
                            <option value="recentes">Mais recente</option>
                        </select>
                        {filtrosAtivos ? (
                            <button type="button" className="btn-action-ghost" onClick={limparFiltros} style={{ color: 'var(--accent)', marginLeft: 'auto' }}>
                                Limpar filtros
                            </button>
                        ) : null}
                    </div>
                </div>
            </header>

            {studentsError ? (
                <div className="dashboard-error-banner mt-3" role="alert">
                    <span>Não foi possível carregar os {studentPlural.toLowerCase()}.</span>
                    <button type="button" className="btn-secondary" onClick={() => void fetchStudents({ reset: true })}>
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
                    flex: 1,
                    transition: 'flex 0.2s ease',
                    overflowY: 'auto',
                    minWidth: 0,
                }}
            >

            {studentsHasMore ? (
                <div className="mt-3 animate-in">
                    <button
                        type="button"
                        className="students-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingMore || studentsLoading}
                    >
                        {loadingMore ? 'Carregando…' : `Carregar mais ${studentPlural.toLowerCase()}`}
                    </button>
                    <p className="text-xs text-light mt-1">
                        {terms.studentsLoadMoreFootnote
                            .replace(/\{students\}/g, studentPlural.toLowerCase())
                            .replace(/\{pipeline\}/g, pipelineName)}
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
                                        navigate(`/student/${s.id}`);
                                    }
                                }}
                                onClick={() => navigate(`/student/${s.id}`)}
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
                                <span style={{ color: '#9A3412', opacity: 0.7 }}>{normalizeLeadProfileType(s.type) || s.type}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}

            <div
                className="flex-col gap-2 mt-4"
                ref={listScrollRef}
                style={shouldVirtualizeStudents ? { maxHeight: 'calc(100vh - 260px)', overflow: 'auto' } : undefined}
            >
                {studentsLoading && students.length === 0 ? (
                    <div className="students-skeleton-list mt-4" role="status" aria-live="polite" aria-busy="true">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="card student-card students-skeleton-row" style={{ height: 72 }} />
                        ))}
                    </div>
                ) : students.length === 0 ? (
                    <div className="card students-empty-root mt-4 animate-in">
                        {filtrosAtivos ? (
                            <EmptyState
                                insideCard
                                variant="default"
                                tone="solid"
                                title={`Nenhum ${studentSingular.toLowerCase()} encontrado com esses filtros.`}
                                secondaryAction={{ label: 'Limpar filtros', onClick: limparFiltros, variant: 'link' }}
                                role="status"
                            />
                        ) : (
                            <EmptyState
                                insideCard
                                variant="default"
                                tone="solid"
                                title={`Nenhum ${studentSingular.toLowerCase()} ${terms.enrolledPastParticiple} ainda.`}
                                description={terms.studentsEmptyHowItWorks.replace(/\{pipeline\}/g, pipelineName)}
                                primaryAction={{ label: `Ir para o ${pipelineName}`, onClick: () => navigate('/pipeline') }}
                                role="status"
                            />
                        )}
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="mt-4 animate-in">
                        <EmptyState
                            variant="default"
                            tone="solid"
                            title={`Nenhum ${studentSingular.toLowerCase()} encontrado com esses filtros.`}
                            secondaryAction={{ label: 'Limpar filtros', onClick: limparFiltros, variant: 'link' }}
                            role="status"
                        />
                    </div>
                ) : shouldVirtualizeStudents ? (
                    <div style={{ height: studentVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                        {studentVirtualizer.getVirtualItems().map((vi) => {
                            const student = filteredStudents[vi.index];
                            return (
                                <div
                                    key={student.id}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${vi.start}px)`,
                                    }}
                                >
                                    {renderStudentCard(student, vi.index)}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    filteredStudents.map((student, i) => (
                        <React.Fragment key={student.id}>{renderStudentCard(student, i)}</React.Fragment>
                    ))
                )}
            </div>

            </div>
            </div>

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.CONVERTED}
                title={`Importar ${studentPlural}`}
                importing={importing}
                financeConfig={financeConfig}
            />

            {showCreateStudent ? (
                <div className="students-create-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowCreateStudent(false)}>
                    <form className="students-create-modal" onSubmit={handleCreateStudent} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="students-create-head">
                            <h3>Cadastrar {studentSingular.toLowerCase()}</h3>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => {
                                    if (creatingStudent) return;
                                    setShowCreateStudent(false);
                                }}
                                aria-label={`Fechar cadastro de ${studentSingular.toLowerCase()}`}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="students-create-grid">
                            <label>
                                Nome*
                                <input
                                    type="text"
                                    value={newStudent.name}
                                    onChange={(e) => setNewStudent((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: João Silva"
                                    required
                                    autoFocus
                                />
                            </label>
                            <label>
                                Telefone
                                <input
                                    type="tel"
                                    value={newStudent.phone}
                                    onChange={(e) => setNewStudent((prev) => ({ ...prev, phone: e.target.value }))}
                                    placeholder="(11) 99999-0000"
                                />
                            </label>
                            <label>
                                Perfil
                                <select
                                    value={newStudent.type}
                                    onChange={(e) => setNewStudent((prev) => ({ ...prev, type: e.target.value }))}
                                >
                                    <option value="Adulto">Adulto</option>
                                    <option value="Criança">Criança</option>
                                    <option value="Juniores">Juniores</option>
                                </select>
                            </label>
                            <label>
                                Origem
                                <select
                                    value={newStudent.origin}
                                    onChange={(e) => setNewStudent((prev) => ({ ...prev, origin: e.target.value }))}
                                >
                                    {LEAD_ORIGIN.map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ gridColumn: '1 / -1' }}>
                                Plano
                                <PlanSelect
                                    financeConfig={financeConfig}
                                    value={newStudent.plan}
                                    onChange={(v) => setNewStudent((prev) => ({ ...prev, plan: v }))}
                                    disabled={creatingStudent}
                                    className=""
                                    style={{ width: '100%', marginTop: 6 }}
                                />
                            </label>
                            {(newStudent.type === 'Criança' || newStudent.type === 'Juniores') ? (
                                <>
                                    <label>
                                        Responsável
                                        <input
                                            type="text"
                                            value={newStudent.parentName}
                                            onChange={(e) => setNewStudent((prev) => ({ ...prev, parentName: e.target.value }))}
                                            placeholder="Ex: Maria Silva"
                                        />
                                    </label>
                                    <label>
                                        Idade
                                        <input
                                            type="number"
                                            min="0"
                                            value={newStudent.age}
                                            onChange={(e) => setNewStudent((prev) => ({ ...prev, age: e.target.value }))}
                                            placeholder="Ex: 10"
                                        />
                                    </label>
                                </>
                            ) : null}
                        </div>

                        <div className="students-create-actions">
                            <button
                                type="button"
                                className="btn-action-ghost"
                                onClick={() => {
                                    if (creatingStudent) return;
                                    setShowCreateStudent(false);
                                }}
                            >
                                Cancelar
                            </button>
                            <button type="submit" className="btn-action-primary" disabled={creatingStudent}>
                                {creatingStudent ? 'Salvando...' : `Salvar ${studentSingular.toLowerCase()}`}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}

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
        .students-create-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3000;
          padding: 16px;
        }
        .students-create-modal {
          width: min(640px, 100%);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: var(--shadow);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .students-create-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .students-create-head h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--text);
        }
        .students-create-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .students-create-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--text-secondary);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .students-create-grid input,
        .students-create-grid select {
          height: 40px;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0 10px;
          color: var(--text);
          background: var(--surface);
          font-size: 0.9rem;
          font-weight: 500;
          text-transform: none;
          letter-spacing: normal;
        }
        .students-create-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .students-mobile-filter-bar,
        .students-mobile-filters-panel { display: none; }
        .students-filters-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          border: 0.5px solid var(--border-light);
          background: var(--surface);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          font-family: inherit;
        }
        .students-filters-toggle__chev { transition: transform 0.2s ease; }
        .students-filters-toggle__chev--open { transform: rotate(180deg); }
        .students-filters-clear-mobile {
          padding: 8px 12px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          cursor: pointer;
          font-family: inherit;
        }
        .students-mobile-filters-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .students-mobile-filter-group { width: 100%; flex-direction: column; align-items: stretch; }
        .students-mobile-filter-group select { border-right: none; border-bottom: 0.5px solid var(--border-light); width: 100%; }
        .students-mobile-filter-group select:last-child { border-bottom: none; }
        .students-mobile-sort {
          width: 100%;
          padding: 8px 10px;
          font-size: 12px;
          border: 0.5px solid var(--border-light);
          border-radius: 8px;
          color: var(--text-secondary);
          background: var(--surface);
        }
        @media (max-width: 767px) {
          .students-header-row-filters { display: none !important; }
          .students-mobile-filter-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding-top: 4px;
            border-top: 0.5px solid var(--border-light);
          }
          .students-mobile-filters-panel {
            display: none;
            flex-direction: column;
            gap: 10px;
            padding-top: 10px;
            border-top: 0.5px solid var(--border-light);
          }
          .students-mobile-filters-panel.is-open { display: flex; }
          .students-header-row-search { flex-direction: column; align-items: stretch; }
          .students-header-search { flex: 1 1 100%; max-width: none; min-width: 0; }
          .students-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 640px) {
          .students-create-grid {
            grid-template-columns: 1fr;
          }
        }
      `}} />
        </div>
    );
};

export default Students;
