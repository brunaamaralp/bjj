/** Backlog: aluno inativo/trancado; filtros (turma/plano); virtualização para listas muito longas. */
import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate, Link } from 'react-router-dom';
import { Search, MessageCircle, ChevronRight, GraduationCap, Upload, RefreshCw } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';

function normalizePhone(v) {
    return String(v || '').replace(/\D/g, '');
}

const Students = () => {
    const navigate = useNavigate();
    const labels = useLeadStore((s) => s.labels);
    const { leads, importLeads, fetchLeads, fetchMoreLeads } = useLeadStore();
    const leadsLoading = useLeadStore((s) => s.loading);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);
    const [searchTerm, setSearchTerm] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [listRefreshing, setListRefreshing] = useState(false);

    const students = leads.filter((l) => l.status === LEAD_STATUS.CONVERTED);
    const q = String(searchTerm || '').trim().toLowerCase();
    const qPhone = normalizePhone(searchTerm);
    const filteredStudents = students.filter((s) => {
        const name = String(s.name || '').toLowerCase();
        const phoneNorm = normalizePhone(s.phone);
        if (qPhone && phoneNorm.includes(qPhone)) return true;
        if (q && name.includes(q)) return true;
        if (!q && !qPhone) return true;
        return false;
    });

    const handleImport = (rows) => {
        const withStatus = rows.map((r) => ({ ...r, status: LEAD_STATUS.CONVERTED }));
        importLeads(withStatus);
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

    const handleLoadMore = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const studentLabel = labels.students || 'Alunos';
    const studentSingular = studentLabel.toLowerCase().endsWith('s') && studentLabel.length > 1
        ? studentLabel.slice(0, -1)
        : studentLabel;
    const pipelineName = labels.pipeline || 'Funil';

    const exportTitle = 'Exporta somente os alunos já carregados neste aparelho. Se houver mais páginas no servidor, use Carregar mais antes ou exporte após atualizar a lista.';

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <header className="animate-in">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <h2 className="navi-page-title">{studentLabel} Ativos</h2>
                        <p className="navi-eyebrow" style={{ marginTop: 6 }}>
                            Total nesta lista: <span className="navi-ui-count">{students.length}</span>
                            {leadsHasMore ? ' (parcial — há mais leads no servidor)' : ''}
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
                        <ExportButton leads={students} fileName="alunos-ativos" label="Exportar" title={exportTitle} />
                        <button type="button" className="import-btn" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Importar
                        </button>
                    </div>
                </div>
                <p className="text-xs text-light mt-2" style={{ lineHeight: 1.4 }}>
                    {exportTitle}
                </p>
            </header>

            <div className="search-wrapper mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <Search size={18} className="search-icon" />
                <input
                    type="text"
                    placeholder="Buscar por nome ou celular..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            {leadsHasMore ? (
                <div className="mt-3 animate-in">
                    <button
                        type="button"
                        className="students-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingMore || leadsLoading}
                    >
                        {loadingMore ? 'Carregando…' : 'Carregar mais leads'}
                    </button>
                    <p className="text-xs text-light mt-1">
                        A lista de alunos usa os mesmos dados do servidor que o {pipelineName}. Carregue mais para incluir matriculados em registros antigos.
                    </p>
                </div>
            ) : null}

            <div className="flex-col gap-2 mt-4">
                {filteredStudents.length > 0 ? filteredStudents.map((student, i) => {
                    const digits = normalizePhone(student.phone);
                    return (
                        <div
                            key={student.id}
                            className="card student-card animate-in"
                            style={{ animationDelay: `${0.03 * i}s` }}
                            onClick={() => navigate(`/lead/${student.id}`)}
                        >
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4" style={{ flex: 1 }}>
                                    <div className="student-avatar">
                                        {(String(student.name || '').trim().charAt(0) || '?').toUpperCase()}
                                    </div>
                                    <div>
                                        <strong style={{ fontSize: '0.95rem' }}>{student.name || 'Sem nome'}</strong>
                                        <p className="text-small">{student.type} • {student.phone}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {digits ? (
                                        <Link
                                            to={`/inbox?phone=${encodeURIComponent(digits)}`}
                                            className="student-inbox-link"
                                            draggable={false}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            Atendimento
                                        </Link>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="quick-action-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(`https://wa.me/55${digits}`, '_blank');
                                        }}
                                        disabled={!digits}
                                        title="WhatsApp"
                                    >
                                        <MessageCircle size={16} color="#25D366" />
                                    </button>
                                    <ChevronRight size={16} color="var(--text-muted)" />
                                </div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="empty-state mt-4 animate-in">
                        <GraduationCap size={36} color="var(--text-muted)" style={{ marginBottom: 12, opacity: 0.4 }} />
                        <p>
                            {searchTerm
                                ? `Nenhum ${studentSingular.toLowerCase()} encontrado para "${searchTerm}".`
                                : `Nenhum ${studentSingular.toLowerCase()} matriculado ainda nesta lista.`}
                        </p>
                        <p className="text-xs text-light mt-1">
                            Importe uma planilha, cadastre em Novo {studentSingular.toLowerCase()}, ou mova cards para Matrícula no {pipelineName}.
                        </p>
                    </div>
                )}
            </div>

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.CONVERTED}
                title="Importar Alunos"
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .search-wrapper { position: relative; }
        .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .search-input { 
          width: 100%; padding: 14px 16px 14px 44px; border-radius: var(--radius); 
          border: 1.5px solid var(--border); font-size: 0.95rem; background: var(--surface);
          outline: none; transition: var(--transition); color: var(--text);
        }
        .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }
        .student-card { 
          cursor: pointer; padding: 14px 16px; 
          border-left: 4px solid var(--purple); 
          transition: var(--transition);
        }
        .student-card:hover { box-shadow: var(--shadow); }
        .student-avatar { 
          width: 40px; height: 40px; border-radius: 50%; 
          background: var(--purple-light); color: var(--purple); 
          display: flex; align-items: center; justify-content: center; 
          font-weight: 800; font-size: 1rem; flex-shrink: 0;
        }
        .student-inbox-link {
          font-size: 0.72rem; font-weight: 700; color: var(--accent);
          text-decoration: none; margin-right: 2px;
        }
        .student-inbox-link:hover { text-decoration: underline; }
        .quick-action-btn { 
          width: 36px; height: 36px; border-radius: 50%; 
          background: var(--border-light); padding: 0; min-height: auto;
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
