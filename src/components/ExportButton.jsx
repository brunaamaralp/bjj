import React from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

const ExportButton = ({ leads, fileName = 'bjj-crm-export', label = 'Exportar' }) => {
    const handleExport = () => {
        if (!leads || leads.length === 0) return;

        const data = leads.map(l => ({
            'Nome': l.name || '',
            'Telefone': l.phone || '',
            'Tipo': l.type || '',
            'Origem': l.origin || '',
            'Status': l.status || '',
            'Data Aula': l.scheduledDate || '',
            'Horário': l.scheduledTime || '',
            'Criado em': l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '',
        }));

        const ws = XLSX.utils.json_to_sheet(data);

        // Auto-size columns
        const colWidths = Object.keys(data[0]).map(key => ({
            wch: Math.max(key.length, ...data.map(row => (row[key] || '').toString().length)) + 2
        }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Dados');
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

    return (
        <button className="export-btn" onClick={handleExport} disabled={!leads || leads.length === 0}>
            <Download size={16} /> {label}

            <style dangerouslySetInnerHTML={{
                __html: `
        .export-btn {
          background: var(--surface); border: 1.5px solid var(--border);
          color: var(--text-secondary); padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px; transition: var(--transition);
        }
        .export-btn:hover { border-color: var(--accent); color: var(--accent); }
        .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}} />
        </button>
    );
};

export default ExportButton;
