import React, { useCallback, useEffect, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';
import {
  buildAcademyStagesConfigSavePayload,
  readStagesConfigRawFromAcademyDoc,
} from '../../lib/pipelineStagesStorage.js';
import { useUiStore } from '../../store/useUiStore';
import { useTerms } from '../../lib/terminology.js';
import { useUserRole } from '../../lib/useUserRole';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import PipelineStageEditorList from '../pipeline/PipelineStageEditorList.jsx';
import {
  buildDefaultPipelineStages,
  cleanStagesForSave,
  DEFAULT_STAGE_SLA_DAYS,
  normalizePipelineStagesFromDoc,
} from '../../lib/pipelineStagesConfig.js';

export default function PipelineStagesSection({
  academyId,
  vertical = 'fitness',
  academyDataVersion = 0,
  academyForRole = {},
}) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academyForRole);
  const canEdit = role === 'owner';
  const [stages, setStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirmDefault, setConfirmDefault] = useState(false);

  const loadStages = useCallback(async () => {
    if (!academyId) return;
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      setStages(
        normalizePipelineStagesFromDoc(readStagesConfigRawFromAcademyDoc(doc), { vertical, terms })
      );
    } catch (e) {
      console.error('[PipelineStagesSection]', e);
      addToast({ type: 'error', message: 'Não foi possível carregar as etapas do funil.' });
      setStages(buildDefaultPipelineStages(terms));
    }
  }, [academyId, vertical, terms, addToast]);

  useEffect(() => {
    void loadStages();
  }, [loadStages, academyDataVersion]);

  const saveStages = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const cleaned = cleanStagesForSave(stages);
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      await databases.updateDocument(
        DB_ID,
        ACADEMIES_COL,
        academyId,
        buildAcademyStagesConfigSavePayload(doc, cleaned)
      );
      invalidateAcademyDocumentCache(academyId);
      setStages(cleaned);
      addToast({ type: 'success', message: 'Etapas do funil salvas.' });
    } catch (e) {
      console.error('saveStages:', e);
      addToast({ type: 'error', message: 'Erro ao salvar etapas do funil.' });
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    const id = `custom-${Date.now()}`;
    setStages((prev) => [...prev, { id, label: 'Nova etapa', slaDays: DEFAULT_STAGE_SLA_DAYS }]);
  };

  const applyDefault = () => {
    setStages(
      buildDefaultPipelineStages(terms).map((s) => ({
        ...s,
        slaDays: s.slaDays ?? DEFAULT_STAGE_SLA_DAYS,
      }))
    );
    setConfirmDefault(false);
  };

  return (
    <div className="finance-settings-section-body">
      <div className="card pipeline-stages-editor">
        <div className="pipeline-stages-editor__head pipeline-stages-editor__head--sortable">
          <span className="pipeline-stages-editor__head-drag" aria-hidden />
          <span>Nome da etapa</span>
          <span title="Alerta quando o interessado permanece mais dias que o limite nesta etapa">SLA (dias)</span>
        </div>
        <div className="pipeline-stages-editor__body">
          <PipelineStageEditorList
            stages={stages}
            onChange={setStages}
            canEdit={canEdit}
            variant="settings"
          />
        </div>
      </div>
      {canEdit ? (
        <div className="pipeline-stages-editor__actions">
          <button type="button" className="btn-outline" onClick={addStage}>
            <PlusCircle size={16} aria-hidden /> Adicionar etapa
          </button>
          <button type="button" className="btn-outline" onClick={() => setConfirmDefault(true)}>
            Funil padrão
          </button>
          <div className="pipeline-stages-editor__actions-spacer" aria-hidden />
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveStages()}>
            {saving ? 'Salvando…' : 'Salvar etapas'}
          </button>
        </div>
      ) : (
        <p className="text-small text-muted pipeline-stages-editor__readonly-hint">
          Somente o titular pode editar as etapas do funil.
        </p>
      )}

      <ConfirmDialog
        open={confirmDefault}
        title="Aplicar funil padrão?"
        description="As etapas atuais serão substituídas pelo modelo padrão. Clique em Salvar etapas para gravar."
        confirmLabel="Aplicar"
        onConfirm={applyDefault}
        onClose={() => setConfirmDefault(false)}
      />
    </div>
  );
}
