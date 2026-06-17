import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, teams, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { getAcademyDocument, invalidateAcademyDocumentCache } from '../lib/getAcademyDocument.js';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { AUTOMATION_LABELS, parseAutomationsConfig, serializeAutomationsConfig } from '../lib/useAutomations.js';
import { useTerms } from '../lib/terminology.js';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection.js';
import { computeAutomationReadiness } from '../lib/automationUx.js';
import {
  isWhatsAppIntegrationConnected,
  isWhatsAppIntegrationDisconnected,
} from '../lib/whatsappIntegrationState.js';
import { canEditWhatsappTemplates } from '../lib/canEditWhatsappTemplates.js';
import AutomacoesSection from '../components/academy/AutomacoesSection.jsx';
import { useAutomationPreviewLead } from '../hooks/useAutomationPreviewLead.js';

export default function AutomacoesConfigTab({
  onGuardStateChange,
  setupGuideActive = false,
  showTabIntro = false,
}) {
  const terms = useTerms();
  const automationLabels = useMemo(
    () => ({
      ...AUTOMATION_LABELS,
      converted: {
        label: terms.automationConvertedLabel,
        description: terms.automationConvertedDescription,
      },
    }),
    [terms.automationConvertedLabel, terms.automationConvertedDescription]
  );

  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const previewLead = useAutomationPreviewLead();
  const addToast = useUiStore((s) => s.addToast);
  const [membership, setMembership] = useState(null);

  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const academyName = String(academyDoc?.name || '').trim();

  useEffect(() => {
    if (!academyDoc?.teamId || !userId) return;
    if (String(academyDoc.ownerId || '') === String(userId)) return;
    teams
      .listMemberships(academyDoc.teamId)
      .then((res) => {
        const m = (res.memberships || []).find((x) => String(x.userId) === String(userId));
        setMembership(m || null);
      })
      .catch(() => setMembership(null));
  }, [academyDoc?.teamId, academyDoc?.ownerId, userId]);

  const canEdit = canEditWhatsappTemplates(userId, academyDoc, membership);

  const { waStatus, waStatusChecked, waInfo } = useZapsterWhatsAppConnection(academyId, {
    deferInitialFetch: true,
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waIntegrationConnected = isWhatsAppIntegrationConnected(waStatus, waStatusChecked);
  const waOfflineUi = isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked);

  const [academy, setAcademy] = useState({
    automationsConfigRaw: '',
    whatsappTemplates: '',
  });
  const [automationsConfig, setAutomationsConfig] = useState(() => parseAutomationsConfig(null));
  const [savingAutomations, setSavingAutomations] = useState(false);
  const [lastSaveFailed, setLastSaveFailed] = useState(false);
  const [academyDataVersion, setAcademyDataVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!academyId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const doc = await getAcademyDocument(academyId);
        if (cancelled) return;
        setAcademy({
          automationsConfigRaw: doc.automations_config || '',
          whatsappTemplates: doc.whatsappTemplates || '',
        });
        const cfg = parseAutomationsConfig(doc.automations_config || '');
        if (doc.birthday_cron_enabled === true && cfg.birthday?.active !== true) {
          cfg.birthday = { ...cfg.birthday, active: true, templateKey: 'birthday' };
        }
        setAutomationsConfig(cfg);
        setAcademyDataVersion((v) => v + 1);
      } catch (e) {
        console.error('[AutomacoesConfig]', e);
        addToast({ type: 'error', message: 'Não foi possível carregar as automações.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, addToast]);

  const templatesMap = useMemo(() => {
    let parsed = {};
    try {
      const raw = academy.whatsappTemplates;
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p;
    } catch {
      parsed = {};
    }
    return { ...DEFAULT_WHATSAPP_TEMPLATES, ...parsed };
  }, [academy.whatsappTemplates]);

  const templateOptions = useMemo(
    () =>
      Object.keys(templatesMap)
        .filter((k) => String(templatesMap[k] || '').trim())
        .map((k) => ({ id: k, label: WHATSAPP_TEMPLATE_LABELS[k] || k })),
    [templatesMap]
  );

  const noTemplatesAvailable = templateOptions.length === 0;

  const readiness = useMemo(
    () =>
      computeAutomationReadiness({
        automationsConfig,
        templatesMap,
        waConnected: waIntegrationConnected,
        waOfflineUi,
        waStatusChecked,
        hasZapsterInstance: Boolean(waInfo?.instance_id),
      }),
    [automationsConfig, templatesMap, waIntegrationConnected, waOfflineUi, waStatusChecked, waInfo?.instance_id]
  );

  const persistAutomations = useCallback(
    async (nextConfig, { successMessage } = {}) => {
      if (!academyId || !canEdit) return false;
      setSavingAutomations(true);
      setLastSaveFailed(false);
      try {
        const raw = JSON.stringify(nextConfig || {});
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          automations_config: raw,
        });
        invalidateAcademyDocumentCache(academyId);
        setAcademy((prev) => ({
          ...prev,
          automationsConfigRaw: raw,
        }));
        setAcademyDataVersion((v) => v + 1);
        if (successMessage) {
          addToast({ type: 'success', message: successMessage });
        }
        return true;
      } catch (e) {
        console.error('save automations:', e);
        setLastSaveFailed(true);
        addToast({ type: 'error', message: 'Não foi possível salvar. Tente novamente.' });
        return false;
      } finally {
        setSavingAutomations(false);
      }
    },
    [academyId, canEdit, addToast]
  );

  const isDirty = useMemo(
    () =>
      serializeAutomationsConfig(automationsConfig) !==
      serializeAutomationsConfig(academy.automationsConfigRaw),
    [automationsConfig, academy.automationsConfigRaw]
  );

  useEffect(() => {
    onGuardStateChange?.({ isDirty, isSaving: savingAutomations });
  }, [isDirty, savingAutomations, onGuardStateChange]);

  if (loading) {
    return (
      <p className="text-small text-muted" role="status" aria-live="polite">
        Carregando configurações…
      </p>
    );
  }

  return (
    <AutomacoesSection
      automationLabels={automationLabels}
      automationsConfig={automationsConfig}
      setAutomationsConfig={setAutomationsConfig}
      templateOptions={templateOptions}
      templatesMap={templatesMap}
      academyName={academyName}
      noTemplatesAvailable={noTemplatesAvailable}
      readiness={readiness}
      canEdit={canEdit}
      savingAutomations={savingAutomations}
      saveFailed={lastSaveFailed}
      onPersistConfig={persistAutomations}
      onRetrySave={() => void persistAutomations(automationsConfig)}
      previewLead={previewLead}
      setupGuideActive={setupGuideActive}
      showTabIntro={showTabIntro}
    />
  );
}
