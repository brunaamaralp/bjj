import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, ChevronRight, GraduationCap, Upload, Download } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';

const Students = () => {
    const navigate = useNavigate();
    const { leads, importLeads } = useLeadStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [showImport, setShowImport] = useState(false);

    const students = leads.filter(l => l.status === LEAD_STATUS.CONVERTED);
    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.includes(searchTerm)
    );

    const handleImport = (rows) => {
        const withStatus = rows.map(r => ({ ...r, status: LEAD_STATUS.CONVERTED }));
        importLeads(withStatus);
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <header className="animate-in">
                <div className="flex justify-between items-center">
                    <div>
                        <h2>Alunos Ativos</h2>
                        <p className="text-small">Total: {students.length} aluno{students.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex gap-2">
                        <ExportButton leads={students} fileName="alunos-ativos" label="Exportar" />
                        <button className="import-btn" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Importar
                        </button>
                    </div>
                </div>
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

            <div className="flex-col gap-2 mt-4">
                {filteredStudents.length > 0 ? filteredStudents.map((student, i) => (
                    <div key={student.id} className="card student-card animate-in" style={{ animationDelay: `${0.03 * i}s` }} onClick={() => navigate(`/lead/${student.id}`)}>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4" style={{ flex: 1 }}>
                                <div className="student-avatar">
                                    {student.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <strong style={{ fontSize: '0.95rem' }}>{student.name}</strong>
                                    <p className="text-small">{student.type} • {student.phone}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="quick-action-btn" onClick={(e) => {
                                    e.stopPropagation();
                                    const cleanPhone = student.phone.replace(/\D/g, '');
                                    window.open(`https://wa.me/55${cleanPhone}`, '_blank');
                                }}>
                                    <MessageCircle size={16} color="#25D366" />
                                </button>
                                <ChevronRight size={16} color="var(--text-muted)" />
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="empty-state mt-4 animate-in">
                        <GraduationCap size={36} color="var(--text-muted)" style={{ marginBottom: 12, opacity: 0.4 }} />
                        <p>{searchTerm ? `Nenhum aluno encontrado para "${searchTerm}"` : 'Nenhum aluno matriculado ainda.'}</p>
                        <p className="text-xs text-light mt-1">Importe uma planilha ou matricule leads pelo pipeline.</p>
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
        .quick-action-btn { 
          width: 36px; height: 36px; border-radius: 50%; 
          background: var(--border-light); padding: 0; min-height: auto;
          display: flex; align-items: center; justify-content: center;
        }
        .quick-action-btn:hover { background: var(--border); }
        .import-btn {
          background: var(--accent); color: white; padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px;
        }
        .import-btn:hover { filter: brightness(1.1); }
      `}} />
        </div>
    );
};

export default Students;
