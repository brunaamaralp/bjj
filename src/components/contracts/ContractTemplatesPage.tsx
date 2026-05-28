import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useContractTemplates,
  useCreateContractTemplate,
  useDeleteContractTemplate,
  useUpdateContractTemplate,
} from '../../features/contracts/queries.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import {
  DEFAULT_CONTRACT_TEMPLATE_HTML,
  mapLeadDocToContractVariables,
} from '../../lib/contractTemplateVariables.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ContractTemplateEditor from './ContractTemplateEditor.js';
import PageHeader from '../layout/PageHeader.jsx';
import './contracts.css';
import { friendlyError } from '../../lib/errorMessages.js';

type EditorMode = 'create' | 'edit' | null;

type ContractTemplatesPageProps = { embedded?: boolean };

export default function ContractTemplatesPage({ embedded = false }: ContractTemplatesPageProps) {
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);

  const { data, isLoading, isError, error, refetch } = useContractTemplates(false);
  const createMutation = useCreateContractTemplate();
  const updateMutation = useUpdateContractTemplate();
  const deleteMutation = useDeleteContractTemplate();

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [planNames, setPlanNames] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_CONTRACT_TEMPLATE_HTML);

  const templates = data?.templates || [];
  const configured = data?.configured !== false;

  const previewVars = useMemo(
    () =>
      mapLeadDocToContractVariables(
        {
          name: 'João da Silva',
          email: 'joao@email.com',
          phone: '11999990000',
          cpf: '12345678901',
          responsavel: 'Maria da Silva',
          cpf_responsavel: '98765432100',
          plan: 'Mensal',
          type: 'Adulto',
          turma: 'Adulto — Noite',
          belt: 'Azul',
          enrollmentDate: '2024-03-15',
          birthDate: '1990-05-20',
        },
        String(academyDoc?.name || 'Sua academia')
      ),
    [academyDoc?.name]
  );

  const resetEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setName('');
    setDescription('');
    setPlanNames('');
    setIsDefault(false);
    setBodyHtml(DEFAULT_CONTRACT_TEMPLATE_HTML);
  };

  const openCreate = () => {
    resetEditor();
    setEditorMode('create');
  };

  const openEdit = (t: (typeof templates)[number]) => {
    setEditorMode('edit');
    setEditingId(t.$id);
    setName(t.name);
    setDescription(t.description || '');
    setPlanNames((t.planNames || []).join(', '));
    setIsDefault(t.isDefault);
    setBodyHtml(t.bodyHtml || DEFAULT_CONTRACT_TEMPLATE_HTML);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast({ type: 'error', message: 'Informe o nome do modelo.' });
      return;
    }
    if (!bodyHtml.trim()) {
      addToast({ type: 'error', message: 'Escreva o conteúdo do contrato.' });
      return;
    }
    const plans = planNames
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      if (editorMode === 'edit' && editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          patch: {
            name: name.trim(),
            description: description.trim() || undefined,
            planNames: plans,
            isDefault,
            bodyHtml,
          },
        });
        addToast({ type: 'success', message: 'Modelo atualizado.' });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          planNames: plans,
          isDefault,
          bodyHtml,
        });
        addToast({ type: 'success', message: 'Modelo criado.' });
      }
      resetEditor();
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar' });
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Excluir o modelo "${label}"?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      addToast({ type: 'success', message: 'Modelo excluído.' });
      if (editingId === id) resetEditor();
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao excluir' });
    }
  };

  if (navRole !== 'owner') {
    return (
      <div className="container contracts-page">
        <p className="text-muted">Apenas o proprietário da academia pode gerenciar modelos de contrato.</p>
        <Link to="/alunos?tab=contratos" className="btn-outline" style={{ marginTop: 12 }}>
          Voltar aos contratos
        </Link>
      </div>
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className={embedded ? 'contracts-page' : 'container contracts-page'}>
      <PageHeader
        className="contracts-page-header"
        title="Modelos de contrato"
        subtitle="Edite modelos com variáveis e vincule planos na aba Financeiro."
        prefix={
          !embedded ? (
            <Link to="/empresa" className="navi-eyebrow flex items-center gap-1" style={{ marginBottom: 8, textTransform: 'none', letterSpacing: 'normal' }}>
              <ArrowLeft size={14} /> Configurações
            </Link>
          ) : null
        }
        actions={
          !editorMode ? (
            <button type="button" className="btn-primary" onClick={openCreate} disabled={!configured}>
              <Plus size={16} /> Novo modelo
            </button>
          ) : null
        }
      />

      {!configured ? (
        <div className="card mt-4" style={{ padding: 16 }}>
          <p className="text-small text-muted">
            Defina <code>APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID=contract_templates</code> no servidor e
            rode <code>npm run provision:contract-templates</code>.
          </p>
        </div>
      ) : null}

      {editorMode ? (
        <section className="card mt-4 animate-in">
          <h2 className="navi-section-heading" style={{ marginBottom: 12 }}>
            {editorMode === 'edit' ? 'Editar modelo' : 'Novo modelo'}
          </h2>
          <form className="flex-col" style={{ gap: 12 }} onSubmit={handleSave}>
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
              <span>Modelo padrão</span>
            </label>

            <ContractTemplateEditor
              bodyHtml={bodyHtml}
              onChange={setBodyHtml}
              previewVars={previewVars}
              disabled={saving}
            />

            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <button type="button" className="btn-outline" onClick={resetEditor} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar modelo'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-4 animate-in">
        <h2 className="navi-section-heading mb-2">Biblioteca</h2>
        {isLoading ? <PageSkeleton variant="table" rows={4} columns={4} /> : null}
        {isError ? (
          <ErrorBanner
            message={friendlyError(error, 'load')}
            onRetry={() => refetch()}
          />
        ) : null}
        {!isLoading && !isError && templates.length === 0 ? (
          <p className="text-muted text-small">
            Nenhum modelo ainda. Clique em <strong>Novo modelo</strong> para criar o primeiro.
          </p>
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
                      <button type="button" className="btn-ghost text-small" onClick={() => openEdit(t)}>
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-small"
                        onClick={async () => {
                          try {
                            await updateMutation.mutateAsync({
                              id: t.$id,
                              patch: { active: !t.active },
                            });
                            refetch();
                          } catch (err) {
                            addToast({
                              type: 'error',
                              message: err instanceof Error ? err.message : 'Erro',
                            });
                          }
                        }}
                      >
                        {t.active ? 'Desativar' : 'Ativar'}
                      </button>
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
