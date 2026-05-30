import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useContractTemplates,
  useCreateContractTemplate,
  useDeleteContractTemplate,
  useEnsureAcademyContractSetup,
  useUpdateContractTemplate,
} from '../../features/contracts/queries.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite.js';
import {
  DEFAULT_CONTRACT_TEMPLATE_HTML,
} from '../../lib/contractTemplateVariables.js';
import {
  defaultContractSignerLayout,
  parseContractSignerLayout,
  type ContractSignerLayout,
} from '../../../lib/contracts/contractSignerLayout.js';
import ContractSignerLayoutForm from './ContractSignerLayoutForm.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import ContractTemplateEditor from './ContractTemplateEditor.js';
import ContractTemplateMetaForm from './ContractTemplateMetaForm.js';
import PageHeader from '../layout/PageHeader.jsx';
import {
  buildEditorSnapshot,
  isEditorDirty,
  type ContractTemplateEditorSnapshot,
} from './contractTemplateEditorState.js';
import {
  CONTRACT_TEMPLATE_PURPOSE_LABELS,
  applyTemplatePlanLinks,
  financePlanTemplateField,
  namedFinancePlans,
  normalizeTemplatePurpose,
  plansUsingTemplate,
} from '../../lib/contractPlanTemplates.js';
import type { ContractTemplatePurpose } from '../../features/contracts/templatesApi.js';
import './contracts.css';
import { friendlyError } from '../../lib/errorMessages.js';

type EditorMode = 'create' | 'edit' | null;

type ContractTemplatesPageProps = { embedded?: boolean };

type TemplateRow = {
  $id: string;
  name: string;
  description?: string;
  purpose?: ContractTemplatePurpose;
  isDefault?: boolean;
  active?: boolean;
  bodyHtml?: string;
  signerLayoutJson?: string;
  signerLayout?: ContractSignerLayout;
};

export default function ContractTemplatesPage({ embedded = false }: ContractTemplatesPageProps) {
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, isError, error, refetch } = useContractTemplates(false);
  const createMutation = useCreateContractTemplate();
  const updateMutation = useUpdateContractTemplate();
  const deleteMutation = useDeleteContractTemplate();
  const ensureSetupMutation = useEnsureAcademyContractSetup();

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState<ContractTemplatePurpose>('enrollment');
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_CONTRACT_TEMPLATE_HTML);
  const [signerLayout, setSignerLayout] = useState<ContractSignerLayout>(defaultContractSignerLayout());
  const [selectedPlanNames, setSelectedPlanNames] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; body?: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const baselineRef = useRef<ContractTemplateEditorSnapshot | null>(null);
  const urlSyncRef = useRef(false);

  const templates = data?.templates || [];
  const configured = data?.configured !== false;

  const hasEnrollmentTemplate = useMemo(
    () => templates.some((t) => t.active && normalizeTemplatePurpose(t.purpose) === 'enrollment'),
    [templates]
  );
  const hasRescissionTemplate = useMemo(
    () => templates.some((t) => t.active && normalizeTemplatePurpose(t.purpose) === 'rescission'),
    [templates]
  );
  const needsAutoSetup = configured && (!hasEnrollmentTemplate || !hasRescissionTemplate);
  const financePlanNames = useMemo(() => namedFinancePlans(financeConfig), [financeConfig]);

  const editingTemplate = useMemo(
    () => (editingId ? templates.find((row) => row.$id === editingId) || null : null),
    [editingId, templates]
  );

  const persistPlanLinks = async (templateId: string, templatePurpose: ContractTemplatePurpose) => {
    if (!academyId) return;
    const latestFinanceConfig = useLeadStore.getState().financeConfig || financeConfig;
    const { config, changed } = applyTemplatePlanLinks(latestFinanceConfig, {
      templateId,
      purpose: templatePurpose,
      selectedPlanNames,
      templates,
    });
    if (!changed) return;
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      financeConfig: JSON.stringify(config),
    });
    useLeadStore.getState().setFinanceConfig(config);
  };

  const handleEnsureSetup = async () => {
    try {
      const result = await ensureSetupMutation.mutateAsync();
      if (result.financeConfig && typeof result.financeConfig === 'object') {
        useLeadStore.getState().setFinanceConfig(result.financeConfig);
      }
      const parts: string[] = [];
      if (result.summary.templatesCreated?.length) {
        parts.push(
          result.summary.templatesCreated
            .map((p) => CONTRACT_TEMPLATE_PURPOSE_LABELS[p] || p)
            .join(' e ')
        );
      }
      if (result.summary.plansLinked > 0) {
        parts.push(`${result.summary.plansLinked} plano(s) vinculado(s) no Financeiro`);
      }
      addToast({
        type: 'success',
        message: parts.length ? `Pronto: ${parts.join(' · ')}.` : 'Contratos já estavam configurados.',
      });
      refetch();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao configurar contratos',
      });
    }
  };

  const currentSnapshot = useMemo(
    () =>
      buildEditorSnapshot({
        name,
        description,
        purpose,
        bodyHtml,
        signerLayout,
        selectedPlanNames,
      }),
    [name, description, purpose, bodyHtml, signerLayout, selectedPlanNames]
  );

  const plansLabelForTemplate = useCallback(
    (templateId: string, templatePurpose: ContractTemplatePurpose) => {
      const field =
        templatePurpose === 'rescission' ? 'rescissionTemplateId' : 'contractTemplateId';
      const names = plansUsingTemplate(financeConfig, templateId, field);
      return names.length ? names.join(', ') : '—';
    },
    [financeConfig]
  );

  const dirty = isEditorDirty(currentSnapshot, baselineRef.current);

  const syncEditorUrl = useCallback(
    (mode: EditorMode, id: string | null) => {
      urlSyncRef.current = true;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (embedded) next.set('tab', 'contratos');
          if (mode === 'create') {
            next.set('new', '1');
            next.delete('edit');
          } else if (mode === 'edit' && id) {
            next.set('edit', id);
            next.delete('new');
          } else {
            next.delete('edit');
            next.delete('new');
          }
          return next;
        },
        { replace: true }
      );
    },
    [embedded, setSearchParams]
  );

  const applyEditorState = useCallback((state: {
    mode: EditorMode;
    id: string | null;
    name: string;
    description: string;
    purpose: ContractTemplatePurpose;
    bodyHtml: string;
    signerLayout: ContractSignerLayout;
    selectedPlanNames: string[];
  }) => {
    setEditorMode(state.mode);
    setEditingId(state.id);
    setName(state.name);
    setDescription(state.description);
    setPurpose(state.purpose);
    setBodyHtml(state.bodyHtml);
    setSignerLayout(state.signerLayout);
    setSelectedPlanNames(state.selectedPlanNames);
    setFieldErrors({});
    baselineRef.current = buildEditorSnapshot({
      name: state.name,
      description: state.description,
      purpose: state.purpose,
      bodyHtml: state.bodyHtml,
      signerLayout: state.signerLayout,
      selectedPlanNames: state.selectedPlanNames,
    });
  }, []);

  const closeEditor = useCallback(() => {
    applyEditorState({
      mode: null,
      id: null,
      name: '',
      description: '',
      purpose: 'enrollment',
      bodyHtml: DEFAULT_CONTRACT_TEMPLATE_HTML,
      signerLayout: defaultContractSignerLayout(),
      selectedPlanNames: [],
    });
    syncEditorUrl(null, null);
  }, [applyEditorState, syncEditorUrl]);

  const openCreate = useCallback(() => {
    applyEditorState({
      mode: 'create',
      id: null,
      name: '',
      description: '',
      purpose: 'enrollment',
      bodyHtml: DEFAULT_CONTRACT_TEMPLATE_HTML,
      signerLayout: defaultContractSignerLayout(),
      selectedPlanNames: [],
    });
    syncEditorUrl('create', null);
  }, [applyEditorState, syncEditorUrl]);

  const openEdit = useCallback(
    (t: TemplateRow) => {
      const templatePurpose = normalizeTemplatePurpose(t.purpose) as ContractTemplatePurpose;
      const field = financePlanTemplateField(templatePurpose);
      applyEditorState({
        mode: 'edit',
        id: t.$id,
        name: t.name,
        description: t.description || '',
        purpose: templatePurpose,
        bodyHtml: t.bodyHtml || DEFAULT_CONTRACT_TEMPLATE_HTML,
        signerLayout: t.signerLayout || parseContractSignerLayout(t.signerLayoutJson),
        selectedPlanNames: plansUsingTemplate(financeConfig, t.$id, field),
      });
      syncEditorUrl('edit', t.$id);
    },
    [applyEditorState, financeConfig, syncEditorUrl]
  );

  const requestCloseEditor = useCallback(() => {
    if (dirty) {
      setDiscardConfirm(true);
      return;
    }
    closeEditor();
  }, [dirty, closeEditor]);

  useEffect(() => {
    if (!configured || isLoading || navRole !== 'owner') return;

    const editParam = searchParams.get('edit');
    const isNew = searchParams.get('new') === '1';

    if (urlSyncRef.current) {
      urlSyncRef.current = false;
      return;
    }

    if (isNew) {
      if (editorMode !== 'create') openCreate();
      return;
    }

    if (editParam) {
      if (editorMode === 'edit' && editingId === editParam) return;
      const t = templates.find((row) => row.$id === editParam);
      if (t) openEdit(t);
      return;
    }

    if (editorMode) closeEditor();
  }, [
    configured,
    isLoading,
    navRole,
    searchParams,
    templates,
    editorMode,
    editingId,
    openCreate,
    openEdit,
    closeEditor,
  ]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { name?: string; body?: string } = {};
    if (!name.trim()) errors.name = 'Informe o nome do modelo.';
    if (!bodyHtml.trim()) errors.body = 'Escreva o conteúdo do contrato.';
    if (errors.name || errors.body) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    try {
      if (editorMode === 'edit' && editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          patch: {
            name: name.trim(),
            description: description.trim() || undefined,
            bodyHtml,
            signerLayoutJson: JSON.stringify(signerLayout),
          },
        });
        await persistPlanLinks(editingId, purpose);
        addToast({ type: 'success', message: 'Modelo atualizado.' });
      } else {
        const created = await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          purpose,
          bodyHtml,
          signerLayoutJson: JSON.stringify(signerLayout),
        });
        await persistPlanLinks(created.$id, purpose);
        addToast({ type: 'success', message: 'Modelo criado.' });
      }
      closeEditor();
      refetch();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar' });
    }
  };

  const handleDelete = (id: string, label: string) => {
    setDeleteConfirm({ id, label });
  };

  const runDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deleteMutation.mutateAsync(id);
      addToast({ type: 'success', message: 'Modelo excluído.' });
      if (editingId === id) closeEditor();
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
  const editorTitle =
    editorMode === 'edit'
      ? `Editar: ${name.trim() || 'modelo'}`
      : 'Novo modelo';

  return (
    <div className={embedded ? 'contracts-page' : 'container contracts-page'}>
      <PageHeader
        className="contracts-page-header"
        title="Modelos de contrato"
        subtitle="Textos para assinatura digital. Marque os planos de mensalidade em cada modelo."
        prefix={
          !embedded ? (
            <Link
              to="/empresa"
              className="navi-eyebrow flex items-center gap-1"
              style={{ marginBottom: 8, textTransform: 'none', letterSpacing: 'normal' }}
            >
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

      {configured && needsAutoSetup && !editorMode ? (
        <div className="card mt-4 contract-template-setup-banner" style={{ padding: 16 }}>
          <p className="text-small text-muted" style={{ margin: '0 0 10px' }}>
            Para usar contratos por plano, gere os modelos padrão de matrícula e rescisão. Depois marque os planos
            em cada modelo.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={ensureSetupMutation.isPending}
            onClick={() => void handleEnsureSetup()}
          >
            {ensureSetupMutation.isPending ? 'Configurando…' : 'Gerar modelos padrão e vincular planos'}
          </button>
        </div>
      ) : null}

      {editorMode ? (
        <section className="card mt-4 animate-in contract-template-editor-focus">
          <div className="contract-template-editor-focus__header">
            <button
              type="button"
              className="contract-template-editor-back edit-link"
              onClick={requestCloseEditor}
              disabled={saving}
            >
              <ChevronLeft size={16} aria-hidden />
              Biblioteca de modelos
            </button>
            <h2 className="navi-section-heading contract-template-editor-focus__title">{editorTitle}</h2>
          </div>

          <form className="contract-template-editor-focus__form" onSubmit={handleSave}>
            <ContractTemplateMetaForm
              name={name}
              description={description}
              purpose={purpose}
              purposeLocked={editorMode === 'edit'}
              nameError={fieldErrors.name}
              disabled={saving}
              planNames={financePlanNames}
              selectedPlanNames={selectedPlanNames}
              isDefault={Boolean(editingTemplate?.isDefault)}
              onNameChange={(v) => {
                setName(v);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
              onDescriptionChange={setDescription}
              onPurposeChange={setPurpose}
              onSelectedPlanNamesChange={setSelectedPlanNames}
            />

            <ContractTemplateEditor
              bodyHtml={bodyHtml}
              onChange={(html) => {
                setBodyHtml(html);
                if (fieldErrors.body) setFieldErrors((prev) => ({ ...prev, body: undefined }));
              }}
              disabled={saving}
              bodyError={fieldErrors.body}
            />

            <ContractSignerLayoutForm
              layout={signerLayout}
              onChange={setSignerLayout}
              disabled={saving}
            />

            <div className="contract-template-editor-focus__actions">
              <button type="button" className="btn-outline" onClick={requestCloseEditor} disabled={saving}>
                Descartar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || (editorMode === 'edit' && !dirty)}
              >
                {saving ? 'Salvando…' : 'Salvar modelo'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!editorMode ? (
        <section className="mt-4 animate-in">
          <h2 className="navi-section-heading mb-2">Biblioteca</h2>
          {isLoading ? <PageSkeleton variant="table" rows={4} columns={4} /> : null}
          {isError ? (
            <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => refetch()} />
          ) : null}
          {!isLoading && !isError && templates.length === 0 ? (
            <div className="card contract-template-empty">
              <p className="text-muted text-small" style={{ margin: 0 }}>
                Nenhum modelo ainda. Gere matrícula e rescisão padrão ou crie um modelo manualmente.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!configured || ensureSetupMutation.isPending}
                  onClick={() => void handleEnsureSetup()}
                >
                  {ensureSetupMutation.isPending ? 'Configurando…' : 'Gerar modelos padrão'}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={openCreate}
                  disabled={!configured}
                >
                  <Plus size={16} /> Criar manualmente
                </button>
              </div>
            </div>
          ) : null}
          {!isLoading && templates.length > 0 ? (
            <div className="card">
              <table className="contracts-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
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
                        {CONTRACT_TEMPLATE_PURPOSE_LABELS[normalizeTemplatePurpose(t.purpose)]}
                      </td>
                      <td className="text-small text-muted">
                        {plansLabelForTemplate(
                          t.$id,
                          normalizeTemplatePurpose(t.purpose) as ContractTemplatePurpose
                        )}
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
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title="Excluir modelo?"
        description={deleteConfirm ? `Excluir o modelo "${deleteConfirm.label}"?` : ''}
        confirmLabel="Excluir"
        onConfirm={() => void runDeleteConfirmed()}
        onClose={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={discardConfirm}
        title="Descartar alterações?"
        description="O modelo não foi salvo. As alterações serão perdidas."
        confirmLabel="Descartar"
        confirmVariant="danger"
        onConfirm={() => {
          setDiscardConfirm(false);
          closeEditor();
        }}
        onClose={() => setDiscardConfirm(false)}
      />
    </div>
  );
}
