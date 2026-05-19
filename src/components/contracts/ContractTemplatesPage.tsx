import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Trash2, Upload } from 'lucide-react';
import {
  useContractTemplates,
  useCreateContractTemplate,
  useDeleteContractTemplate,
  useUpdateContractTemplate,
} from '../../features/contracts/queries.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import './contracts.css';

export default function ContractTemplatesPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);

  const { data, isLoading, isError, error, refetch } = useContractTemplates(false);
  const createMutation = useCreateContractTemplate();
  const updateMutation = useUpdateContractTemplate();
  const deleteMutation = useDeleteContractTemplate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [planNames, setPlanNames] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  if (navRole !== 'owner') {
    return (
      <div className="container contracts-page">
        <p className="text-muted">Apenas o proprietário da academia pode gerenciar modelos de contrato.</p>
        <Link to="/contratos" className="btn-outline" style={{ marginTop: 12 }}>
          Voltar aos contratos
        </Link>
      </div>
    );
  }

  const templates = data?.templates || [];
  const configured = data?.configured !== false;

  const resetForm = () => {
    setName('');
    setDescription('');
    setPlanNames('');
    setIsDefault(false);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      addToast({ type: 'error', message: 'Selecione um PDF para o modelo.' });
      return;
    }
    if (!name.trim()) {
      addToast({ type: 'error', message: 'Informe o nome do modelo.' });
      return;
    }
    try {
      const plans = planNames
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        planNames: plans,
        isDefault,
        file,
      });
      addToast({ type: 'success', message: 'Modelo criado.' });
      resetForm();
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao criar modelo' });
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, patch: { active: !active } });
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao atualizar' });
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, patch: { isDefault: true } });
      addToast({ type: 'success', message: 'Modelo padrão atualizado.' });
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro' });
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Excluir o modelo "${label}"?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      addToast({ type: 'success', message: 'Modelo excluído.' });
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao excluir' });
    }
  };

  return (
    <div className="container contracts-page">
      <div className="contracts-page-header animate-in">
        <div>
          <Link to="/contratos" className="navi-eyebrow flex items-center gap-1" style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Contratos
          </Link>
          <h1 className="navi-page-title flex items-center gap-2">
            <FileText size={26} strokeWidth={1.75} aria-hidden />
            Modelos de contrato
          </h1>
          <p className="navi-eyebrow" style={{ marginTop: 6 }}>
            PDFs reutilizáveis para envio via Autentique. Vincule a planos em Financeiro → Configurações.
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="card mt-4" style={{ padding: 16 }}>
          <p className="text-small text-muted">
            Modelos não configurados no servidor. Defina{' '}
            <code>APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID</code> e{' '}
            <code>APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID</code> e execute{' '}
            <code>npm run provision:contract-templates</code>.
          </p>
        </div>
      ) : null}

      <section className="card mt-4 animate-in">
        <h2 className="navi-section-heading" style={{ marginBottom: 12 }}>
          <Plus size={18} /> Novo modelo
        </h2>
        <form className="flex-col" style={{ gap: 12 }} onSubmit={handleCreate}>
          <div className="form-group">
            <label className="task-field-label">Nome</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="task-field-label">Descrição (opcional)</label>
            <input
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="task-field-label">Planos vinculados (nomes separados por vírgula)</label>
            <input
              className="form-input"
              value={planNames}
              onChange={(e) => setPlanNames(e.target.value)}
              placeholder="Mensal, Anual"
            />
          </div>
          <label className="contracts-sandbox">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            <span>Modelo padrão (quando não houver vínculo por plano)</span>
          </label>
          <div
            className="contracts-upload-zone"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <Upload size={24} />
            <p>{file ? file.name : 'PDF do modelo'}</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={createMutation.isPending || !configured}>
            {createMutation.isPending ? 'Salvando…' : 'Salvar modelo'}
          </button>
        </form>
      </section>

      <section className="mt-4 animate-in">
        <h2 className="navi-section-heading mb-2">Biblioteca</h2>
        {isLoading ? <PageSkeleton variant="table" rows={4} columns={4} /> : null}
        {isError ? (
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Erro ao carregar modelos'}
            onRetry={() => refetch()}
          />
        ) : null}
        {!isLoading && !isError && templates.length === 0 ? (
          <p className="text-muted text-small">Nenhum modelo cadastrado.</p>
        ) : null}
        {!isLoading && templates.length > 0 ? (
          <div className="card">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Planos</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.$id}>
                    <td>
                      {t.name}
                      {t.isDefault ? (
                        <span className="contracts-status-badge" style={{ marginLeft: 8 }}>
                          Padrão
                        </span>
                      ) : null}
                    </td>
                    <td className="text-small text-muted">
                      {t.planNames?.length ? t.planNames.join(', ') : '—'}
                    </td>
                    <td>{t.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="contracts-table-actions">
                      {!t.isDefault ? (
                        <button type="button" className="btn-ghost text-small" onClick={() => setAsDefault(t.$id)}>
                          Tornar padrão
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost text-small"
                        onClick={() => toggleActive(t.$id, t.active)}
                      >
                        {t.active ? 'Desativar' : 'Ativar'}
                      </button>
                      {t.fileUrl ? (
                        <a href={t.fileUrl} target="_blank" rel="noreferrer" className="btn-ghost text-small">
                          Ver PDF
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Excluir"
                        onClick={() => handleDelete(t.$id, t.name)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
