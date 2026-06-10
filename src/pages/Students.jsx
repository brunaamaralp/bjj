import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../store/useLeadStore';
import { useStudentStore, STUDENTS_PAGE_SIZE } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Upload, RefreshCw, Download, UserPlus, X, DoorOpen, Users } from 'lucide-react';
import SearchField from '../components/shared/SearchField.jsx';

const ControlIdAttendancePanel = lazy(() => import('../components/attendance/ControlIdAttendancePanel.jsx'));
const ImportSheet = lazy(() => import('../components/ImportSheet'));

import { databases, DB_ID, STUDENTS_COL } from '../lib/appwrite';
import { Query } from 'appwrite';
import PlanSelect from '../components/shared/PlanSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useTerms } from '../lib/terminology.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import FieldError from '../components/shared/FieldError.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import { useStudentsListFilters, STUDENTS_FILTERS_EXPANDED_KEY } from '../hooks/useStudentsListFilters.js';
import { useStudentsListData } from '../hooks/useStudentsListData.js';
import { useStudentsCreateForm } from '../hooks/useStudentsCreateForm.js';
import StudentListCard from '../components/student/StudentListCard.jsx';
import { maskCpfForExport } from '../lib/maskCpf.js';
import PageHeader from '../components/layout/PageHeader.jsx';

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-BR');
}

const Students = ({ embedded = false }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const viewMode = !embedded && searchParams.get('view') === 'presenca' ? 'presenca' : 'lista';
    const labels = useLeadStore((s) => s.labels);
    const terms = useTerms();
    const studentPlural = terms.students;
    const studentSingular = terms.student;
    const addToast = useUiStore((s) => s.addToast);
    const importStudents = useStudentStore((s) => s.importStudents);
    const studentsError = useStudentStore((s) => s.studentsError);
    const academyId = useLeadStore((s) => s.academyId);
    const financeConfig = useLeadStore((s) => s.financeConfig);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);

    const { turmas: turmasConfig } = useAcademyTurmas(academyId);
    const controlIdCfg = useAcademyControlId(academyId, { fetch: viewMode === 'presenca' });
    const listScrollRef = useRef(null);
    const [showImport, setShowImport] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);

    const filters = useStudentsListFilters({ financeConfig });
    const {
        searchTerm,
        setSearchTerm,
        filtroOrigem,
        setFiltroOrigem,
        filtroTurma,
        setFiltroTurma,
        filtroPlano,
        setFiltroPlano,
        ordenacao,
        setOrdenacao,
        showInactive,
        setShowInactive,
        filtersExpanded,
        setFiltersExpanded,
        planOptions,
        filterState,
        serverFetchOpts,
        hasServerFilters,
        limparFiltros,
        filtrosAtivos,
        collapsibleFilterCount,
    } = filters;

    const listData = useStudentsListData({
        academyId,
        filterState,
        serverFetchOpts,
        hasServerFilters,
        serverSearchActive: filters.serverSearchActive,
        studentPlural,
        listScrollRef,
    });
    const {
        studentCount,
        filteredStudents,
        aniversariantesHoje,
        shouldVirtualizeStudents,
        studentVirtualizer,
        studentsLoading,
        loadingMore,
        studentsHasMore,
        listRefreshing,
        handleRefreshList,
        handleLoadMore,
        fetchStudents,
    } = listData;

    const createForm = useStudentsCreateForm({
        academyId,
        academyList,
        userId,
        terms,
        onCreated: (id) => navigate(`/student/${id}`),
    });
    const {
        showCreateStudent,
        setShowCreateStudent,
        creatingStudent,
        newStudent,
        setNewStudent,
        phoneError,
        setPhoneError,
        emailError,
        setEmailError,
        handleCreateStudent,
        maskPhone,
    } = createForm;

    const openProfile = useCallback(
        (studentId) => navigate(`/student/${studentId}`),
        [navigate]
    );

    useEffect(() => {
        try {
            sessionStorage.setItem(STUDENTS_FILTERS_EXPANDED_KEY, filtersExpanded ? '1' : '0');
        } catch {
            /* ignore */
        }
    }, [filtersExpanded]);

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

    const fetchAllStudentsPaginated = async (academyId, onProgress) => {
        if (!STUDENTS_COL) return [];
        const all = [];
        let cursor = null;
        for (;;) {
            const queries = [
                Query.equal('academyId', academyId),
                Query.orderDesc('$createdAt'),
                Query.limit(STUDENTS_PAGE_SIZE),
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));
            const res = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
            const docs = res.documents || [];
            all.push(...docs);
            onProgress?.(all.length, res.total);
            if (docs.length < STUDENTS_PAGE_SIZE) break;
            cursor = docs[docs.length - 1].$id;
        }
        return all;
    };

    const handleExportAll = async () => {
        if (!academyId) return;
        setExporting(true);
        try {
            const allStudents = await fetchAllStudentsPaginated(academyId, (n, total) => {
                if (total && n < total) {
                    addToast({ type: 'info', message: `Exportando… ${n} de ${total}` });
                }
            });

            if (allStudents.length === 0) {
                addToast({ type: 'warning', message: `Nenhum ${terms.student.toLowerCase()} encontrado para exportar.` });
                return;
            }

            const XLSX = await import('xlsx');

            const data = allStudents.map((l) => ({
                'Nome': l.name || '',
                'Telefone': l.phone || '',
                'CPF': maskCpfForExport(l.cpf || l.cpf_responsavel),
                'Turma': String(l.turma || l.className || '').trim(),
                'Origem': l.origin || l.source_origin || '',
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
            console.error('[export students]', e?.message || e);
            addToast({ type: 'error', message: `Erro ao exportar ${terms.students.toLowerCase()}.` });
        } finally {
            setExporting(false);
        }
    };

    const studentLabel = terms.students;
    const pipelineName = labels.pipeline || 'Funil';

    const exportTooltip = terms.exportStudentsTooltip
        .replace(/\{students\}/g, studentPlural.toLowerCase())
        .replace(/\{student\}/g, terms.student);

    const renderStudentCard = (student, animIndex = 0) => (
        <StudentListCard
            key={student.id}
            student={student}
            academyId={academyId}
            controlIdEnabled={controlIdCfg.enabled}
            studentSingular={studentSingular}
            financeConfig={financeConfig}
            onOpenProfile={openProfile}
            style={shouldVirtualizeStudents ? undefined : { animationDelay: `${0.03 * animIndex}s` }}
        />
    );

    const planFilterSelect = (
        <select value={filtroPlano} onChange={(e) => setFiltroPlano(e.target.value)}>
            <option value="Todos">Todos os planos</option>
            {planOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
            ))}
        </select>
    );

    return (
        <div className={embedded ? 'students-page students-page--embedded' : 'container students-page'}>
            <header className="animate-in">
                {!embedded ? (
                    <>
                    <PageHeader
                        className="navi-page-header--flush"
                        title={studentLabel}
                        subtitle={
                            viewMode === 'presenca'
                                ? `Histórico de ${terms.attendance.toLowerCase()} na catraca Control iD.`
                                : `Consulte cadastro, planos e status dos ${studentPlural.toLowerCase()}.`
                        }
                        meta={
                            viewMode === 'lista' ? (
                            <>
                                <span className="navi-ui-count">{filteredStudents.length}</span>{' '}
                                {studentPlural.toLowerCase()} cadastrados
                                {filtrosAtivos && studentCount !== filteredStudents.length
                                    ? ` (de ${studentCount})`
                                    : ''}
                                {studentsHasMore
                                    ? ` (parcial — há mais ${studentPlural.toLowerCase()} no servidor)`
                                    : ''}
                            </>
                            ) : null
                        }
                    />
                    <div className="mensal-page-tabs students-page-view-tabs" role="tablist" aria-label={`Visualização de ${studentPlural.toLowerCase()}`}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'lista'}
                            className={`mensal-page-tab${viewMode === 'lista' ? ' mensal-page-tab--active' : ''}`}
                            onClick={() => setSearchParams({}, { replace: true })}
                        >
                            <Users size={14} aria-hidden />
                            Lista
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'presenca'}
                            className={`mensal-page-tab${viewMode === 'presenca' ? ' mensal-page-tab--active' : ''}`}
                            onClick={() => setSearchParams({ view: 'presenca' }, { replace: true })}
                        >
                            <DoorOpen size={14} aria-hidden />
                            {terms.attendance}
                        </button>
                    </div>
                    </>
                ) : (
                    <p className="navi-eyebrow students-page-embedded-count navi-page-header__meta" style={{ marginTop: 0, marginBottom: 14 }}>
                        <span className="navi-ui-count">{filteredStudents.length}</span>{' '}
                        {studentPlural.toLowerCase()} cadastrados
                        {filtrosAtivos && studentCount !== filteredStudents.length
                            ? ` (de ${studentCount})`
                            : ''}
                        {studentsHasMore
                            ? ` (parcial — há mais ${studentPlural.toLowerCase()} no servidor)`
                            : ''}
                    </p>
                )}
                {viewMode === 'lista' && (
                <div className="page-header-card students-page-header">
                    <div className="page-header-row navi-toolbar students-header-row-search">
                        <SearchField
                            className="students-header-search"
                            type="text"
                            placeholder="Buscar nome ou telefone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Buscar aluno por nome ou telefone"
                        />
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
                        <button
                            type="button"
                            className="btn-action-ghost"
                            onClick={() => setShowImport(true)}
                        >
                            <Upload size={14} /> Importar
                        </button>
                        <button
                            type="button"
                            className="btn-action-primary students-register-btn"
                            onClick={() => setShowCreateStudent(true)}
                        >
                            <UserPlus size={16} strokeWidth={2.25} aria-hidden /> Cadastrar {studentSingular.toLowerCase()}
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
                        <div className="filter-bar students-mobile-filters-chips">
                            <span
                                className={`filter-chip${!showInactive ? ' is-active' : ''}`}
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
                                className={`filter-chip${showInactive ? ' is-active' : ''}`}
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
                            {planFilterSelect}
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
                    <div className="page-header-row filter-bar students-header-row-filters">
                        <span
                            className={`filter-chip${!showInactive ? ' is-active' : ''}`}
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
                            className={`filter-chip${showInactive ? ' is-active' : ''}`}
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
                            {planFilterSelect}
                        </div>
                        <select
                            value={ordenacao}
                            onChange={(e) => setOrdenacao(e.target.value)}
                            className="form-input navi-control--toolbar"
                            style={{ color: 'var(--text-secondary)' }}
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
                )}
            </header>

            {viewMode === 'presenca' ? (
                <Suspense fallback={<PageSkeleton variant="cards" rows={2} />}>
                    <ControlIdAttendancePanel className="animate-in" style={{ marginTop: 8 }} />
                </Suspense>
            ) : null}

            {viewMode === 'lista' ? (
            <>
            {studentsError ? (
                <ErrorBanner
                    className="mt-3"
                    message={`Não foi possível carregar os ${studentPlural.toLowerCase()}.`}
                    onRetry={() => void fetchStudents({ reset: true, ...serverFetchOpts })}
                />
            ) : null}

            <div className="students-page-body">
            {aniversariantesHoje.length > 0 ? (
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
                            🎂 Aniversariantes hoje ({aniversariantesHoje.length})
                        </p>
                        {aniversariantesHoje.map((s) => (
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
                                <span style={{ color: '#9A3412', opacity: 0.7 }}>
                                    {String(s.turma || s.className || '').trim() || '—'}
                                </span>
                            </div>
                        ))}
                    </div>
            ) : null}

            <div className="students-list-scroll" ref={listScrollRef}>
                <div className={shouldVirtualizeStudents ? 'students-list-virtual' : 'students-list'}>
                {studentsLoading && studentCount === 0 ? (
                    <div className="students-skeleton-list mt-4" role="status" aria-live="polite" aria-busy="true">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="card student-card students-skeleton-row" style={{ height: 72 }} />
                        ))}
                    </div>
                ) : studentCount === 0 ? (
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
                    <div
                        className="students-list-virtual-inner"
                        style={{ height: studentVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}
                    >
                        {studentVirtualizer.getVirtualItems().map((vi) => {
                            const student = filteredStudents[vi.index];
                            return (
                                <div
                                    key={student.id}
                                    data-index={vi.index}
                                    ref={studentVirtualizer.measureElement}
                                    className="students-list-virtual-row"
                                    style={{
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

            {studentsHasMore ? (
                <div className="students-load-more-wrap animate-in">
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

            </div>
            </>
            ) : null}

            {showImport ? (
                <Suspense fallback={null}>
                    <ImportSheet
                        isOpen={showImport}
                        onClose={() => setShowImport(false)}
                        onImport={handleImport}
                        defaultStatus={LEAD_STATUS.CONVERTED}
                        title={`Importar ${studentPlural}`}
                        importing={importing}
                        financeConfig={financeConfig}
                    />
                </Suspense>
            ) : null}

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
                                Telefone*
                                <input
                                    type="tel"
                                    value={newStudent.phone}
                                    onChange={(e) => {
                                        setPhoneError('');
                                        setNewStudent((prev) => ({ ...prev, phone: maskPhone(e.target.value) }));
                                    }}
                                    placeholder="(11) 99999-0000"
                                    required
                                />
                                {phoneError ? <FieldError>{phoneError}</FieldError> : null}
                            </label>
                            <label>
                                E-mail
                                <input
                                    type="email"
                                    value={newStudent.email}
                                    onChange={(e) => {
                                        setEmailError('');
                                        setNewStudent((prev) => ({ ...prev, email: e.target.value.trim() }));
                                    }}
                                    placeholder="nome@email.com"
                                    autoComplete="email"
                                />
                                {emailError ? <FieldError>{emailError}</FieldError> : null}
                            </label>
                            <label>
                                Turma
                                <TurmaSelect
                                    id="new-student-turma"
                                    otherId="new-student-turma-other"
                                    turmas={turmasConfig}
                                    selectValue={newStudent.turmaSelect}
                                    otherText={newStudent.turmaOther}
                                    onSelectChange={(v) => setNewStudent((prev) => ({ ...prev, turmaSelect: v }))}
                                    onOtherChange={(v) => setNewStudent((prev) => ({ ...prev, turmaOther: v }))}
                                    disabled={creatingStudent}
                                    style={{ width: '100%', marginTop: 6 }}
                                />
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
        </div>
    );
};

export default Students;
