import React, { useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { Calendar, Phone, Upload } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';

const COLUMN_CONFIG = [
    { title: 'Novo', status: LEAD_STATUS.NEW, color: 'var(--accent)', bg: 'var(--accent-light)' },
    { title: 'Agendado', status: LEAD_STATUS.SCHEDULED, color: 'var(--warning)', bg: 'var(--warning-light)' },
    { title: 'Compareceu', status: LEAD_STATUS.COMPLETED, color: 'var(--success)', bg: 'var(--success-light)' },
    { title: 'Matriculou', status: LEAD_STATUS.CONVERTED, color: 'var(--purple)', bg: 'var(--purple-light)' },
];

const Pipeline = () => {
    const navigate = useNavigate();
    const { leads, importLeads } = useLeadStore();
    const [showImport, setShowImport] = useState(false);

    const handleImport = (rows) => {
        importLeads(rows);
    };

    return (
        <div className="pipeline-container">
            <div className="pipeline-header">
                <div className="container flex justify-between items-center">
                    <h2>Fluxo de Matrícula</h2>
                    <div className="flex gap-2">
                        <ExportButton leads={leads} fileName="leads-pipeline" label="Exportar" />
                        <button className="import-btn-pipe" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Importar Leads
                        </button>
                    </div>
                </div>
            </div>

            <div className="kanban-wrapper">
                {COLUMN_CONFIG.map(col => {
                    const colLeads = leads.filter(l => l.status === col.status);
                    return (
                        <div key={col.status} className="kanban-column">
                            <div className="col-header">
                                <div className="flex items-center gap-2">
                                    <span className="col-dot" style={{ background: col.color }}></span>
                                    <h3>{col.title}</h3>
                                </div>
                                <span className="col-count" style={{ background: col.bg, color: col.color }}>
                                    {colLeads.length}
                                </span>
                            </div>

                            <div className="col-content">
                                {colLeads.map((lead, i) => (
                                    <div key={lead.id} className="card lead-card animate-in" style={{ animationDelay: `${0.03 * i}s` }} onClick={() => navigate(`/lead/${lead.id}`)}>
                                        <div className="flex justify-between items-center">
                                            <strong style={{ fontSize: '0.92rem' }}>{lead.name}</strong>
                                            <span className="type-pill">{lead.type}</span>
                                        </div>
                                        <div className="lead-meta mt-2 flex items-center gap-2">
                                            <Phone size={12} /> {lead.phone}
                                        </div>
                                        {lead.scheduledDate && (
                                            <div className="lead-meta mt-1 flex items-center gap-2">
                                                <Calendar size={12} /> {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')} {lead.scheduledTime && `às ${lead.scheduledTime}`}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {colLeads.length === 0 && (
                                    <div className="col-empty">
                                        <p>Nenhum lead</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.NEW}
                title="Importar Leads"
            />

            <style dangerouslySetInnerHTML={{
                __html: `
        .pipeline-container { height: calc(100vh - 140px); display: flex; flex-direction: column; }
        .pipeline-header { padding: 16px 0; background: var(--surface); border-bottom: 1px solid var(--border-light); }
        .kanban-wrapper { 
          display: flex; gap: 16px; overflow-x: auto; padding: 16px; flex: 1;
          scrollbar-width: none; scroll-snap-type: x mandatory;
        }
        .kanban-wrapper::-webkit-scrollbar { display: none; }
        .kanban-column { 
          min-width: 280px; display: flex; flex-direction: column; 
          gap: 10px; scroll-snap-align: start;
        }
        .col-header { 
          display: flex; justify-content: space-between; align-items: center; 
          padding-bottom: 10px; margin-bottom: 4px;
        }
        .col-header h3 { font-size: 0.9rem; font-weight: 700; }
        .col-dot { width: 8px; height: 8px; border-radius: 50%; }
        .col-count { 
          padding: 2px 10px; border-radius: var(--radius-full); 
          font-size: 0.75rem; font-weight: 800; 
        }
        .lead-card { 
          cursor: pointer; padding: 14px; 
          border-left: 3px solid var(--border); 
          transition: var(--transition);
        }
        .lead-card:hover { border-left-color: var(--accent); box-shadow: var(--shadow); }
        .type-pill { 
          font-size: 0.6rem; background: var(--border-light); 
          padding: 2px 8px; border-radius: var(--radius-full); 
          color: var(--text-secondary); font-weight: 700; text-transform: uppercase; 
        }
        .lead-meta { font-size: 0.78rem; color: var(--text-secondary); }
        .col-empty { 
          padding: 20px; text-align: center; color: var(--text-muted); 
          font-size: 0.82rem; border: 1.5px dashed var(--border); 
          border-radius: var(--radius-sm); 
        }
        .import-btn-pipe {
          background: var(--accent); color: white; padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px; white-space: nowrap;
        }
        .import-btn-pipe:hover { filter: brightness(1.1); }
      `}} />
        </div>
    );
};

export default Pipeline;
