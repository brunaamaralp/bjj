import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { AUTOMATION_LABELS, parseAutomationsConfig } from '../lib/useAutomations.js';
import { useTerms } from '../lib/terminology.js';
import AutomacoesSection from '../components/academy/AutomacoesSection.jsx';

export default function AutomacoesConfigTab() {
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
  const addToast = useUiStore((s) => s.addToast);

  const [academy, setAcademy] = useState({
    automationsConfigRaw: '',
    whatsappTemplates: '',
  });
  const [automationsConfig, setAutomationsConfig] = useState(() => parseAutomationsConfig(null));
  const [savingAutomations, setSavingAutomations] = useState(false);
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
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademy({
          automationsConfigRaw: doc.automations_config || '',
          whatsappTemplates: doc.whatsappTemplates || '',
        });
        setAutomationsConfig(parseAutomationsConfig(doc.automations_config || ''));
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

  const noTemplatesAvailable = useMemo(() => {
    if (templateOptions.length === 0) return true;
    return !String(academy.whatsappTemplates || '').trim();
  }, [academy.whatsappTemplates, templateOptions.length]);

  const saveAutomations = async () => {
    if (!academyId) return;
    setSavingAutomations(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        automations_config: JSON.stringify(automationsConfig || {}),
      });
      setAcademy((prev) => ({
        ...prev,
        automationsConfigRaw: JSON.stringify(automationsConfig || {}),
      }));
      addToast({ type: 'success', message: 'Automações salvas.' });
    } catch (e) {
      console.error('save automations:', e);
      addToast({ type: 'error', message: 'Não foi possível salvar as automações.' });
    } finally {
      setSavingAutomations(false);
    }
  };

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
      noTemplatesAvailable={noTemplatesAvailable}
      automationsConfigRaw={academy.automationsConfigRaw}
      academyDataVersion={academyDataVersion}
      savingAutomations={savingAutomations}
      onSave={saveAutomations}
    />
  );
}
