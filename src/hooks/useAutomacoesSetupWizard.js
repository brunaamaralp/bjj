import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { parseAutomationsConfig } from '../lib/useAutomations.js';
import { computeAutomationReadiness } from '../lib/automationUx.js';
import {
  automacoesWizardDismissStorageKey,
  clearAutomacoesWizardDismissed,
  computeAutomacoesWizardState,
  isModelosWizardStepDone,
} from '../lib/automacoesSetupWizard.js';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { useZapsterWhatsAppConnection } from './useZapsterWhatsAppConnection.js';

function readWizardDismissed(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesWizardDismissStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

function writeWizardDismissed(academyId) {
  if (!academyId) return;
  try {
    localStorage.setItem(automacoesWizardDismissStorageKey(academyId), '1');
  } catch {
    void 0;
  }
}

/**
 * Carrega estado do guia (modelos → WhatsApp → gatilhos).
 * @param {{ modelosAcknowledged?: boolean }} [options]
 */
export function useAutomacoesSetupWizard({ modelosAcknowledged = false } = {}) {
  const academyId = useLeadStore((s) => s.academyId);
  const completeOnboardingStepIds = useLeadStore((s) => s.completeOnboardingStepIds);
  const [searchParams] = useSearchParams();
  const forceWizard = searchParams.get('wizard') === '1';

  const [dismissed, setDismissed] = useState(() => readWizardDismissed(academyId));
  const [justCompleted, setJustCompleted] = useState(false);
  const celebratedRef = useRef(false);
  const [academyLoad, setAcademyLoad] = useState({ academyId: '', templates: '', automationsRaw: '' });
  const [loading, setLoading] = useState(Boolean(academyId));

  const { waConnected, waInfo } = useZapsterWhatsAppConnection(academyId, {
    deferInitialFetch: true,
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });

  useEffect(() => {
    setDismissed(readWizardDismissed(academyId));
    celebratedRef.current = false;
    setJustCompleted(false);
  }, [academyId]);

  useEffect(() => {
    if (!academyId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void getAcademyDocument(academyId)
      .then((doc) => {
        if (cancelled) return;
        setAcademyLoad({
          academyId,
          templates: doc.whatsappTemplates || '',
          automationsRaw: doc.automations_config || '',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAcademyLoad({ academyId, templates: '', automationsRaw: '' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const templatesMap = useMemo(() => {
    if (academyLoad.academyId !== academyId) return { ...DEFAULT_WHATSAPP_TEMPLATES };
    let parsed = {};
    try {
      const raw = academyLoad.templates;
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p;
    } catch {
      parsed = {};
    }
    return { ...DEFAULT_WHATSAPP_TEMPLATES, ...parsed };
  }, [academyLoad, academyId]);

  const automationsConfig = useMemo(() => {
    if (academyLoad.academyId !== academyId) return parseAutomationsConfig(null);
    return parseAutomationsConfig(academyLoad.automationsRaw);
  }, [academyLoad, academyId]);

  const readiness = useMemo(
    () =>
      computeAutomationReadiness({
        automationsConfig,
        templatesMap,
        waConnected,
        hasZapsterInstance: Boolean(waInfo?.instance_id),
      }),
    [automationsConfig, templatesMap, waConnected, waInfo?.instance_id]
  );

  const wizard = useMemo(
    () =>
      computeAutomacoesWizardState({
        templatesMap,
        modelosAcknowledged,
        zapsterOk: readiness.zapsterOk,
        activeCount: readiness.activeCount,
        dismissed: dismissed && !forceWizard,
      }),
    [templatesMap, modelosAcknowledged, readiness, dismissed, forceWizard]
  );

  const dismiss = useCallback(() => {
    if (!academyId) return;
    writeWizardDismissed(academyId);
    setDismissed(true);
  }, [academyId]);

  const reopenGuide = useCallback(() => {
    if (!academyId) return;
    clearAutomacoesWizardDismissed(academyId);
    setDismissed(false);
  }, [academyId]);

  useEffect(() => {
    if (!academyId || !wizard.allComplete || celebratedRef.current) return;
    celebratedRef.current = true;
    setJustCompleted(true);
    const timer = setTimeout(() => {
      setJustCompleted(false);
      writeWizardDismissed(academyId);
      setDismissed(true);
      void completeOnboardingStepIds(['setup_automations']);
    }, 3200);
    return () => clearTimeout(timer);
  }, [academyId, wizard.allComplete, completeOnboardingStepIds]);

  const canReopenGuide = !loading && !wizard.allComplete && !wizard.show && !justCompleted;

  const modelosStepReady = isModelosWizardStepDone({ templatesMap, modelosAcknowledged });

  return {
    loading,
    readiness,
    templatesMap,
    modelosStepReady,
    dismiss,
    reopenGuide,
    canReopenGuide,
    justCompleted,
    forceWizard,
    ...wizard,
  };
}
