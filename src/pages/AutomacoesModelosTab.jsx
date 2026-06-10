import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, RotateCcw, Send, Copy, Check, ChevronDown, ChevronUp, Info } from 'lucide-react';
import SearchField from '../components/shared/SearchField.jsx';
import { DateInputField } from '../components/DateInput';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { account, teams } from '../lib/appwrite';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_LABELS,
  WHATSAPP_TEMPLATE_PLACEHOLDERS,
  WHATSAPP_TEMPLATE_CHAR_LIMIT,
  SYSTEM_WHATSAPP_TEMPLATE_COUNT,
  applyWhatsappTemplatePlaceholders,
  validateTemplatePlaceholders,
  isTemplateInUse,
} from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useWhatsappTemplatesStore } from '../store/useWhatsappTemplatesStore.js';
import { useTerms } from '../lib/terminology.js';
import { canEditWhatsappTemplates } from '../lib/canEditWhatsappTemplates.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { friendlyError } from '../lib/errorMessages.js';
import '../lib/whatsappTemplates.css';

const DEFAULT_TEMPLATES = DEFAULT_WHATSAPP_TEMPLATES;
const labelFor = WHATSAPP_TEMPLATE_LABELS;

export default function AutomacoesModelosTab() {
  const terms = useTerms();
  const placeholders = useMemo(
    () =>
      WHATSAPP_TEMPLATE_PLACEHOLDERS.map((ph) =>
        ph.token === 'nomeAcademia'
          ? { ...ph, label: ph.label.replace('academia', terms.workspaceNoun) }
          : ph
      ),
    [terms.workspaceNoun]
  );

  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const { leads } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);

  const {
    templates: loadedTemplates,
    automationsRaw,
    usageByKey,
    academyName,
    loading,
    refetch,
    invalidate,
  } = useWhatsappTemplates(academyId);

  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [original, setOriginal] = useState(DEFAULT_TEMPLATES);
  const [sampleLeadId, setSampleLeadId] = useState('');
  const [sampleManual, setSampleManual] = useState({
    name: '',
    phone: '',
    scheduledDate: '',
    scheduledTime: '',
  });
  const [filter, setFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [openPopover, setOpenPopover] = useState(null);
  const [unknownById, setUnknownById] = useState({});
  const popoverRef = useRef(null);

  const canEdit = canEditWhatsappTemplates(userId, academyDoc, membership);

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

  useEffect(() => {
    if (!loadedTemplates) return;
    setTemplates(loadedTemplates);
    setOriginal(loadedTemplates);
  }, [loadedTemplates]);

  useEffect(() => {
    const next = {};
    for (const id of Object.keys(templates)) {
      const v = validateTemplatePlaceholders(String(templates[id] || ''));
      if (!v.ok) next[id] = v.unknown;
    }
    setUnknownById(next);
  }, [templates]);

  useEffect(() => {
    if (!openPopover) return;
    const close = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpenPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openPopover]);

  const templateIds = useMemo(() => Object.keys(DEFAULT_TEMPLATES), []);

  const sampleLead = useMemo(() => {
    const id = String(sampleLeadId || '').trim();
    if (id === '_manual') return null;
    return leads.find((l) => l.id === id) || leads[0] || null;
  }, [leads, sampleLeadId]);

  const sampleData = useMemo(() => {
    if (sampleLead) return sampleLead;
    return {
      name: sampleManual.name,
      phone: sampleManual.phone,
      scheduledDate: sampleManual.scheduledDate,
      scheduledTime: sampleManual.scheduledTime,
    };
  }, [sampleLead, sampleManual]);

  const renderTemplate = (text) =>
    applyWhatsappTemplatePlaceholders(String(text || ''), { lead: sampleData, academyName });

  const overLimit = useMemo(() => {
    for (const id of templateIds) {
      if (String(templates[id] || '').length > WHATSAPP_TEMPLATE_CHAR_LIMIT) return true;
    }
    return false;
  }, [templates, templateIds]);

  const handleInsertPlaceholder = (key, id) => {
    const textarea = document.getElementById(`tpl-${id}`);
    setTemplates((prev) => {
      const cur = String(prev[id] || '');
      const start = textarea && Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : cur.length;
      const end = textarea && Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : cur.length;
      const insertingAtEnd = start === cur.length && end === cur.length;
      const needsSpace = insertingAtEnd && cur && !/\s$/.test(cur);
      const insert = needsSpace ? ` ${key}` : key;
      const next = cur.slice(0, start) + insert + cur.slice(end);
      setTimeout(() => {
        const el = document.getElementById(`tpl-${id}`);
        if (!el) return;
        el.focus();
        const pos = start + insert.length;
        el.setSelectionRange(pos, pos);
      }, 0);
      return { ...prev, [id]: next };
    });
    setOpenPopover(null);
  };

  const saveViaApi = async (body) => {
    const jwt = await account.createJWT();
    const resp = await fetch('/api/academy/whatsapp-templates', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${jwt.jwt}`,
        'x-academy-id': String(academyId || ''),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const raw = await resp.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
    if (!resp.ok) throw new Error(data?.erro || 'Falha ao salvar templates');
    return data;
  };

  const handleSave = async () => {
    if (!academyId || !canEdit) return;
    for (const id of templateIds) {
      const v = validateTemplatePlaceholders(String(templates[id] || ''));
      if (!v.ok) {
        addToast({
          type: 'warning',
          message: `Template "${labelFor[id] || id}": variáveis desconhecidas ${v.unknown.join(', ')}`,
        });
      }
    }
    if (overLimit) {
      addToast({ type: 'error', message: `Cada template deve ter no máximo ${WHATSAPP_TEMPLATE_CHAR_LIMIT} caracteres` });
      return;
    }
    setSaving(true);
    try {
      const data = await saveViaApi({ templates });
      const merged = { ...DEFAULT_TEMPLATES, ...(data.templates || templates) };
      setTemplates(merged);
      setOriginal(merged);
      invalidate();
      useWhatsappTemplatesStore.getState().patchLocal(academyId, {
        templates: merged,
        automationsRaw,
        fetchedAt: Date.now(),
      });
      await refetch();
      addToast({ type: 'success', message: 'Templates salvos' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const runRestoreOne = async (id) => {
    setSaving(true);
    try {
      const data = await saveViaApi({ action: 'restore', key: id });
      const merged = { ...templates, ...(data.templates || {}), [id]: DEFAULT_TEMPLATES[id] };
      setTemplates(merged);
      setOriginal((prev) => ({ ...prev, [id]: DEFAULT_TEMPLATES[id] }));
      invalidate();
      await refetch();
      addToast({ type: 'success', message: 'Template restaurado' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const runResetAllDefaults = async () => {
    setSaving(true);
    try {
      const data = await saveViaApi({ action: 'restore_all' });
      const merged = { ...DEFAULT_TEMPLATES, ...(data.templates || DEFAULT_TEMPLATES) };
      setTemplates(merged);
      setOriginal(merged);
      invalidate();
      await refetch();
      addToast({ type: 'success', message: 'Templates restaurados ao padrão' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!canEdit) return;
    const activeKeys = templateIds.filter((id) => isTemplateInUse(usageByKey?.[id]));
    if (activeKeys.length > 0) {
      setPendingConfirm({
        title: 'Restaurar todos os templates?',
        description: `Templates em uso (${activeKeys.map((k) => labelFor[k] || k).join(', ')}). Restaurar todos para o padrão mesmo assim?`,
        onConfirm: () => void runResetAllDefaults(),
      });
      return;
    }
    setPendingConfirm({
      title: 'Restaurar templates?',
      description: 'Restaurar todos os templates para o padrão? O texto atual será arquivado.',
      onConfirm: () => void runResetAllDefaults(),
    });
  };

  const handleResetOne = (id) => {
    if (!canEdit) return;
    const usage = usageByKey?.[id];
    if (!isTemplateInUse(usage)) {
      void runRestoreOne(id);
      return;
    }
    const names = [
      ...(usage.automations || []).map((a) => a.label),
      ...(usage.birthdayCron ? ['Cron de aniversário (Zapster)'] : []),
    ];
    const label = names.length === 1 ? '1 automação' : `${names.length} automações`;
    setPendingConfirm({
      title: 'Restaurar template?',
      description: `Este template está ativo em ${label} (${names.join(', ')}). Restaurar mesmo assim?`,
      onConfirm: () => void runRestoreOne(id),
    });
  };

  const changed = useMemo(() => JSON.stringify(templates) !== JSON.stringify(original), [templates, original]);

  const filteredIds = useMemo(() => {
    const q = String(filter || '').trim().toLowerCase();
    if (!q) return templateIds;
    return templateIds.filter((id) => {
      const label = String(labelFor[id] || '').toLowerCase();
      const body = String(templates[id] || '').toLowerCase();
      return label.includes(q) || body.includes(q);
    });
  }, [filter, templateIds, templates]);

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1400);
      addToast({ type: 'success', message: 'Copiado' });
    } catch {
      addToast({ type: 'error', message: 'Falha ao copiar' });
    }
  };

  const openWhatsAppTest = (text) => {
    const phone = String(sampleData?.phone || '').replace(/\D/g, '');
    if (!phone) {
      addToast({ type: 'error', message: 'Informe um telefone no lead de exemplo' });
      return;
    }
    const v = validateTemplatePlaceholders(text);
    if (!v.ok) {
      addToast({
        type: 'warning',
        message: `Preview com variáveis omitidas: ${v.unknown.join(', ')}`,
      });
    }
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(renderTemplate(text))}`;
    window.open(url, '_blank');
  };

  const renderUsedBy = (id) => {
    const usage = usageByKey?.[id];
    if (!usage || !isTemplateInUse(usage)) {
      return (
        <p className="text-xs text-light" style={{ marginBottom: 8 }}>
          Nenhuma automação ativa usa este template no momento.
        </p>
      );
    }
    return (
      <div className="tpl-used-by">
        <strong style={{ display: 'block', marginBottom: 4 }}>Usado por</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(usage.automations || []).map((a) => (
            <li key={a.key}>{a.label}</li>
          ))}
          {usage.birthdayCron && id === 'birthday' && (
            <li>Cron de aniversário (envio automático diário)</li>
          )}
          {usage.birthdayCron && id !== 'birthday' && <li>Cron de aniversário (referência indireta)</li>}
        </ul>
      </div>
    );
  };

  return (
    <div className="automacoes-modelos-tab">
      <h2 className="navi-section-heading" style={{ marginTop: 0 }}>Modelos de mensagens</h2>
      <p className="tpl-page-note">
        O sistema oferece <strong>{SYSTEM_WHATSAPP_TEMPLATE_COUNT} modelos fixos</strong>. Você está personalizando{' '}
        <strong>{SYSTEM_WHATSAPP_TEMPLATE_COUNT} de {SYSTEM_WHATSAPP_TEMPLATE_COUNT}</strong> modelos
        {terms.workspaceNoun ? ` da ${terms.workspaceNoun}` : ''}.
      </p>
      {!canEdit && (
        <p className="text-small text-light" style={{ marginBottom: 10 }}>
          Modo leitura: apenas titular ou administrador pode editar. Você pode usar os templates no funil e no inbox.
        </p>
      )}
      <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 14 }}>
        {loading ? 'Carregando…' : !canEdit ? 'Somente leitura.' : changed ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}
      </p>
      <div className="page-header-card">
        <div className="page-header-row navi-toolbar">
          <SearchField
            placeholder="Buscar template..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Buscar template"
          />
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-action-ghost" onClick={handleResetDefaults} disabled={saving || !canEdit}>
            <RotateCcw size={16} /> Restaurar padrão
          </button>
          <button
            type="button"
            className="btn-action-primary"
            onClick={handleSave}
            disabled={!canEdit || !changed || saving || overLimit}
          >
            <Save size={16} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card mt-3 animate-in">
        <div className="flex tpl-preview-lead-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="tpl-preview-lead-label">Pré-visualizar com:</span>
          <select
            className="form-input tpl-preview-lead-select"
            value={sampleLeadId}
            onChange={(e) => setSampleLeadId(e.target.value)}
          >
            <option value="">(Primeiro da lista)</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="_manual">Manual</option>
          </select>
        </div>
        {!sampleLead && (
          <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="Nome"
              value={sampleManual.name}
              onChange={(e) => setSampleManual((p) => ({ ...p, name: e.target.value }))}
              style={{ flex: 1, minWidth: 180 }}
            />
            <input
              className="form-input"
              placeholder="Telefone"
              value={sampleManual.phone}
              onChange={(e) => setSampleManual((p) => ({ ...p, phone: e.target.value }))}
              style={{ width: 170 }}
            />
            <DateInputField
              className="form-input"
              type="date"
              value={sampleManual.scheduledDate}
              onChange={(e) => setSampleManual((p) => ({ ...p, scheduledDate: e.target.value }))}
              style={{ width: 160 }}
            />
            <input
              className="form-input"
              type="time"
              value={sampleManual.scheduledTime}
              onChange={(e) => setSampleManual((p) => ({ ...p, scheduledTime: e.target.value }))}
              style={{ width: 140 }}
            />
          </div>
        )}
      </div>

      <div className="flex-col tpl-template-list mt-3">
        {filteredIds.map((id, i) => {
          const raw = String(templates[id] || '');
          const preview = renderTemplate(raw);
          const isChanged = String(templates[id] || '') !== String(original[id] || '');
          const isOpen = expandedId === id;
          const copyKeyRaw = `raw:${id}`;
          const copyKeyPreview = `preview:${id}`;
          const canTest = Boolean(String(sampleData?.phone || '').replace(/\D/g, ''));
          const len = raw.length;
          const atLimit = len > WHATSAPP_TEMPLATE_CHAR_LIMIT;
          const nearLimit = len >= WHATSAPP_TEMPLATE_CHAR_LIMIT - 74 && !atLimit;
          const inUse = isTemplateInUse(usageByKey?.[id]);
          const unknown = unknownById[id] || [];

          return (
            <div key={id} className="tpl-card animate-in" style={{ animationDelay: `${0.02 * i}s` }}>
              <div
                role="button"
                tabIndex={0}
                className="tpl-card-header"
                style={{
                  borderBottom: isOpen ? '0.5px solid var(--border-light)' : '0.5px solid transparent',
                }}
                onClick={() => setExpandedId(isOpen ? null : id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(isOpen ? null : id);
                  }
                }}
              >
                <div className="tpl-card-header-left">
                  <strong className="tpl-card-title">{labelFor[id] || id}</strong>
                  {inUse && <span className="tpl-badge-in-use">Em uso</span>}
                  {id === 'birthday' && <span className="tpl-badge-auto">Automático</span>}
                  {isChanged && <span className="tpl-badge">Não salvo</span>}
                  <span
                    className={`tpl-char-count${atLimit ? ' tpl-char-count--error' : nearLimit ? ' tpl-char-count--warn' : ''}`}
                  >
                    {len} / {WHATSAPP_TEMPLATE_CHAR_LIMIT}
                  </span>
                </div>
                <div className="tpl-card-header-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-secondary" onClick={() => copyText(raw, copyKeyRaw)}>
                    {copiedKey === copyKeyRaw ? <Check size={16} /> : <Copy size={16} />} Copiar
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => copyText(preview, copyKeyPreview)}>
                    {copiedKey === copyKeyPreview ? <Check size={16} /> : <Copy size={16} />} Preview
                  </button>
                  <span className="tpl-chevron" aria-hidden>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                </div>
              </div>
              <div className={`tpl-accordion-panel${isOpen ? ' is-open' : ''}`}>
                <div className="tpl-accordion-inner" inert={!isOpen ? true : undefined}>
                  <div className="tpl-card-body">
                    {renderUsedBy(id)}
                    {id === 'birthday' && (
                      <p className="text-xs text-light" style={{ marginBottom: 8, lineHeight: 1.45 }}>
                        Enviada automaticamente no aniversário do aluno (cron Zapster).
                      </p>
                    )}
                    <div className="tpl-vars">
                      <div className="navi-section-heading" style={{ fontSize: '0.82rem', marginBottom: 6 }}>
                        Variáveis
                      </div>
                      <div className="tpl-vars-scroll" ref={popoverRef}>
                        {placeholders.map((ph) => (
                          <span key={ph.key} style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              type="button"
                              className={`tpl-chip${unknown.includes(ph.key) ? '' : ''}`}
                              onClick={() => handleInsertPlaceholder(ph.key, id)}
                              onMouseEnter={() => setOpenPopover(`${id}:${ph.key}`)}
                              onFocus={() => setOpenPopover(`${id}:${ph.key}`)}
                              aria-describedby={openPopover === `${id}:${ph.key}` ? `popover-${id}-${ph.token}` : undefined}
                            >
                              {ph.key}
                            </button>
                            {openPopover === `${id}:${ph.key}` && (
                              <div className="tpl-popover" id={`popover-${id}-${ph.token}`} role="tooltip">
                                <div className="tpl-popover-title">{ph.label}</div>
                                <div>
                                  Exemplo: <code>{ph.key}</code> → &quot;{ph.example}&quot;
                                </div>
                              </div>
                            )}
                          </span>
                        ))}
                      </div>
                      {unknown.length > 0 && (
                        <p className="tpl-placeholder-warn" role="alert">
                          <Info size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          Variáveis não reconhecidas: {unknown.join(', ')} — serão omitidas no envio.
                        </p>
                      )}
                    </div>
                    <textarea
                      id={`tpl-${id}`}
                      className={`form-input tpl-template-textarea${atLimit ? ' tpl-template-textarea--error' : ''}`}
                      rows={5}
                      value={templates[id] || ''}
                      disabled={!canEdit}
                      onChange={(e) => setTemplates((prev) => ({ ...prev, [id]: e.target.value }))}
                    />
                    <div className="tpl-preview">
                      <div className="navi-section-heading" style={{ fontSize: '0.82rem', marginBottom: 6 }}>
                        Preview
                      </div>
                      <div className="tpl-preview-box text-small">{preview || '—'}</div>
                      <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openWhatsAppTest(raw)}
                          disabled={!canTest}
                        >
                          <Send size={16} /> Testar no WhatsApp
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleResetOne(id)}
                          disabled={saving}
                        >
                          <RotateCcw size={16} /> Restaurar este
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredIds.length === 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <EmptyState
              insideCard
              variant="compact"
              tone="dashed"
              title={`Nenhum template encontrado para “${filter}”.`}
              role="status"
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || ''}
        description={pendingConfirm?.description}
        confirmLabel="Confirmar"
        loading={saving}
        onConfirm={() => {
          const fn = pendingConfirm?.onConfirm;
          setPendingConfirm(null);
          fn?.();
        }}
        onClose={() => setPendingConfirm(null)}
      />
    </div>
  );
}
