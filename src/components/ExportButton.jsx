import React from 'react';
import { Download } from 'lucide-react';
import { exportLeadsSpreadsheet } from '../lib/exportLeadsSpreadsheet.js';

const ExportButton = ({ leads, fileName = 'bjj-crm-export', label = 'Exportar', title }) => {
    const handleExport = async () => {
        await exportLeadsSpreadsheet(leads, fileName);
    };

    return (
        <button
            type="button"
            className="export-btn"
            onClick={() => void handleExport()}
            disabled={!leads || leads.length === 0}
            title={title}
        >
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
