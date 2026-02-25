import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Check, AlertCircle } from 'lucide-react';

const COLUMN_MAP = {
    'nome': 'name',
    'name': 'name',
    'telefone': 'phone',
    'phone': 'phone',
    'celular': 'phone',
    'whatsapp': 'phone',
    'tipo': 'type',
    'type': 'type',
    'perfil': 'type',
    'origem': 'origin',
    'origin': 'origin',
    'status': 'status',
    'data': 'scheduledDate',
    'data da aula': 'scheduledDate',
    'horario': 'scheduledTime',
    'horário': 'scheduledTime',
};

const normalizeKey = (key) => {
    const normalized = key.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return COLUMN_MAP[normalized] || COLUMN_MAP[key.toString().trim().toLowerCase()] || null;
};

const ImportSheet = ({ isOpen, onClose, onImport, defaultStatus, title }) => {
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [error, setError] = useState('');
    const [mappedKeys, setMappedKeys] = useState([]);
    const fileRef = useRef(null);

    if (!isOpen) return null;

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = XLSX.read(evt.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (jsonData.length === 0) {
                    setError('A planilha está vazia.');
                    return;
                }

                // Map columns
                const originalKeys = Object.keys(jsonData[0]);
                const mapped = originalKeys.map(k => ({
                    original: k,
                    mapped: normalizeKey(k),
                }));
                setMappedKeys(mapped);

                // Transform rows
                const transformed = jsonData.map(row => {
                    const obj = {};
                    mapped.forEach(m => {
                        if (m.mapped) {
                            obj[m.mapped] = row[m.original]?.toString().trim() || '';
                        }
                    });
                    // Apply defaults
                    if (!obj.type) obj.type = 'Adulto';
                    if (!obj.origin) obj.origin = 'Planilha';
                    if (defaultStatus) obj.status = defaultStatus;
                    return obj;
                }).filter(r => r.name && r.name.length > 0);

                if (transformed.length === 0) {
                    setError('Nenhuma linha válida encontrada. Verifique se a coluna "Nome" existe.');
                    return;
                }

                setRows(transformed);
            } catch (err) {
                setError('Erro ao ler o arquivo. Verifique o formato.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleConfirm = () => {
        onImport(rows);
        setRows([]);
        setFileName('');
        setMappedKeys([]);
        onClose();
    };

    const handleCancel = () => {
        setRows([]);
        setFileName('');
        setError('');
        setMappedKeys([]);
        onClose();
    };

    return (
        <div className="import-overlay">
            <div className="import-modal">
                {/* Header */}
                <div className="import-header">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet size={20} color="var(--accent)" />
                        <h3>{title || 'Importar Planilha'}</h3>
                    </div>
                    <button className="icon-btn" onClick={handleCancel}><X size={20} /></button>
                </div>

                {/* Body */}
                <div className="import-body">
                    {rows.length === 0 ? (
                        <>
                            <div
                                className="upload-zone"
                                onClick={() => fileRef.current?.click()}
                            >
                                <Upload size={36} color="var(--accent)" style={{ marginBottom: 12 }} />
                                <p style={{ fontWeight: 600 }}>Clique para escolher arquivo</p>
                                <p className="text-small">Aceita .xlsx, .xls ou .csv</p>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFile}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {error && (
                                <div className="import-error mt-3">
                                    <AlertCircle size={16} /> {error}
                                </div>
                            )}

                            <div className="import-tip mt-4">
                                <p style={{ fontWeight: 600, marginBottom: 6 }}>📋 Formato esperado:</p>
                                <table className="tip-table">
                                    <thead>
                                        <tr><th>Nome</th><th>Telefone</th><th>Tipo</th><th>Origem</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>João Silva</td><td>(11) 99999-0000</td><td>Adulto</td><td>Instagram</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Preview */}
                            <div className="import-success">
                                <Check size={18} />
                                <span><strong>{rows.length}</strong> registro{rows.length > 1 ? 's' : ''} encontrado{rows.length > 1 ? 's' : ''} em <em>{fileName}</em></span>
                            </div>

                            {/* Mapped columns */}
                            <div className="mapped-cols mt-3">
                                {mappedKeys.filter(m => m.mapped).map(m => (
                                    <span key={m.original} className="mapped-tag">
                                        {m.original} → <strong>{m.mapped}</strong>
                                    </span>
                                ))}
                            </div>

                            {/* Preview table */}
                            <div className="preview-table-wrapper mt-3">
                                <table className="preview-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Nome</th>
                                            <th>Telefone</th>
                                            <th>Tipo</th>
                                            <th>Origem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.slice(0, 10).map((r, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td>{r.name}</td>
                                                <td>{r.phone || '-'}</td>
                                                <td>{r.type}</td>
                                                <td>{r.origin}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {rows.length > 10 && (
                                    <p className="text-small text-center mt-2">... e mais {rows.length - 10} registros</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {rows.length > 0 && (
                    <div className="import-footer">
                        <button className="btn-outline" onClick={handleCancel} style={{ flex: 1 }}>Cancelar</button>
                        <button className="btn-secondary" onClick={handleConfirm} style={{ flex: 2 }}>
                            <Check size={18} /> Importar {rows.length} registro{rows.length > 1 ? 's' : ''}
                        </button>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .import-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          z-index: 200; display: flex; align-items: flex-end; justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .import-modal {
          background: var(--surface); border-radius: 20px 20px 0 0; width: 100%; max-width: 600px;
          max-height: 85vh; display: flex; flex-direction: column;
          animation: slideUp 0.3s ease;
        }
        .import-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px 20px 12px; border-bottom: 1px solid var(--border-light);
        }
        .import-header h3 { font-size: 1.1rem; }
        .import-body { padding: 20px; overflow-y: auto; flex: 1; }
        .import-footer { padding: 16px 20px; border-top: 1px solid var(--border-light); display: flex; gap: 10px; }
        .upload-zone {
          border: 2px dashed var(--border); border-radius: var(--radius); padding: 40px 20px;
          text-align: center; cursor: pointer; transition: var(--transition);
          background: var(--surface-hover);
        }
        .upload-zone:hover { border-color: var(--accent); background: var(--accent-light); }
        .import-error {
          display: flex; align-items: center; gap: 8px; padding: 12px 16px;
          background: var(--danger-light); color: var(--danger); border-radius: var(--radius-sm);
          font-size: 0.85rem; font-weight: 500;
        }
        .import-success {
          display: flex; align-items: center; gap: 8px; padding: 12px 16px;
          background: var(--success-light); color: var(--success); border-radius: var(--radius-sm);
          font-size: 0.9rem;
        }
        .import-tip {
          background: var(--surface-hover); border-radius: var(--radius-sm);
          padding: 16px; font-size: 0.85rem;
        }
        .tip-table, .preview-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .tip-table th, .preview-table th {
          text-align: left; padding: 6px 10px; background: var(--border-light);
          font-weight: 700; color: var(--text-secondary); text-transform: uppercase;
          font-size: 0.7rem; letter-spacing: 0.05em;
        }
        .tip-table td, .preview-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-light); }
        .preview-table-wrapper { max-height: 260px; overflow-y: auto; border-radius: var(--radius-sm); border: 1px solid var(--border-light); }
        .mapped-cols { display: flex; flex-wrap: wrap; gap: 6px; }
        .mapped-tag {
          font-size: 0.7rem; padding: 3px 8px; background: var(--accent-light);
          color: var(--accent); border-radius: var(--radius-full); white-space: nowrap;
        }
      `}} />
        </div>
    );
};

export default ImportSheet;
