import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Save, RotateCcw, Send, User, Search, Copy, Check, RotateCw, ChevronLeft } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_LABELS,
  applyWhatsappTemplatePlaceholders
} from '../../lib/whatsappTemplateDefaults.js';

const DEFAULT_TEMPLATES = DEFAULT_WHATSAPP_TEMPLATES;
const labelFor = WHATSAPP_TEMPLATE_LABELS;

const PLACEHOLDERS = [
  { key: '{primeiroNome}', label: 'Primeiro nome' },
  { key: '{nome}', label: 'Igual a primeiro nome (legado)' },
  { key: '{dataAula}', label: 'Data da aula (DD/MM/AAAA)' },
  { key: '{horaAula}', label: 'Hora da aula (HH:MM)' },
  { key: '{amanhaData}', label: 'Texto “amanhã (DD/MM/AAAA)”' },
  { key: '{nomeAcademia}', label: 'Nome da academia' },
  { key: '{dataAulaOpcional}', label: 'Data opcional (prefixa “ do dia …”)' },
];

const Templates = () => {
  const academyId = useLeadStore((s) => s.academyId);
  const { leads } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [original, setOriginal] = useState(DEFAULT_TEMPLATES);
  const [sampleLeadId, setSampleLeadId] = useState('');
  const [sampleManual, setSampleManual] = useState({ name: '', phone: '', scheduledDate: '', scheduledTime: '' });
  const [academyName, setAcademyName] = useState('');
  const [filter, setFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [expanded, setExpanded] = useState({});

  const templateIds = useMemo(() => Object.keys(DEFAULT_TEMPLATES), []);

  const sampleLead = useMemo(() => {
    const id = String(sampleLeadId || '').trim();
    if (id === '_manual') return null;
    const byId = leads.find((l) => l.id === id) || null;
    return byId || leads[0] || null;
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

  useEffect(() => {
    if (!academyId) return;
    databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        setAcademyName(String(doc?.name || '').trim());
        try {
          const raw = doc.whatsappTemplates;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            const merged = { ...DEFAULT_TEMPLATES, ...parsed };
            setTemplates(merged);
            setOriginal(merged);
          } else {
            setTemplates(DEFAULT_TEMPLATES);
            setOriginal(DEFAULT_TEMPLATES);
          }
        } catch {
          setTemplates(DEFAULT_TEMPLATES);
          setOriginal(DEFAULT_TEMPLATES);
        }
      })
      .catch(() => {
        setAcademyName('');
        setTemplates(DEFAULT_TEMPLATES);
        setOriginal(DEFAULT_TEMPLATES);
      });
  }, [academyId]);

  const renderTemplate = (text) =>
    applyWhatsappTemplatePlaceholders(String(text || ''), { lead: sampleData, academyName });

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
      try {
        setTimeout(() => {
          const el = document.getElementById(`tpl-${id}`);
          if (!el) return;
          el.focus();
          const pos = start + insert.length;
          el.setSelectionRange(pos, pos);
        }, 0);
      } catch { void 0; }
      return { ...prev, [id]: next };
    });
  };

  const handleSave = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        whatsappTemplates: JSON.stringify(templates),
      });
      setOriginal(templates);
      addToast({ type: 'success', message: 'Templates salvos' });
    } catch {
      addToast({ type: 'error', message: 'Falha ao salvar templates' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES);
  };

  const handleResetOne = (id) => {
    setTemplates((prev) => ({ ...prev, [id]: DEFAULT_TEMPLATES[id] || '' }));
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
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(String(text || ''))}`;
    window.open(url, '_blank');
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <Link
        to="/empresa#templates"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          color: 'var(--accent)',
          fontWeight: 600,
          fontSize: '0.85rem',
          textDecoration: 'none',
        }}
      >
        <ChevronLeft size={18} strokeWidth={2} aria-hidden />
        Voltar à empresa
      </Link>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="navi-page-title" style={{ margin: 0 }}>Templates de Mensagens</h2>
          <div className="navi-eyebrow" style={{ marginTop: 6 }}>
            {changed ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}
          </div>
        </div>

        <div className="flex" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tpl-search">
            <Search size={16} color="var(--text-secondary)" />
            <input
              className="form-input"
              placeholder="Buscar template…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </div>
          <button className="btn-outline" onClick={handleResetDefaults} disabled={saving}>
            <RotateCcw size={16} /> Restaurar padrão
          </button>
          <button className="btn-secondary" onClick={handleSave} disabled={!changed || saving}>
            <Save size={16} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card mt-3 animate-in">
        <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <User size={18} />
          <span className="navi-subtitle" style={{ margin: 0 }}>Lead de exemplo para preview</span>
          <select
            className="form-input"
            value={sampleLeadId}
            onChange={(e) => setSampleLeadId(e.target.value)}
            style={{ marginLeft: 'auto', maxWidth: 260 }}
          >
            <option value="">(Primeiro da lista)</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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
            <input
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

      <div className="flex-col gap-3 mt-3">
        {filteredIds.map((id, i) => {
          const raw = String(templates[id] || '');
          const preview = renderTemplate(raw);
          const isChanged = String(templates[id] || '') !== String(original[id] || '');
          const isExpanded = expanded[id] !== false;
          const copyKeyRaw = `raw:${id}`;
          const copyKeyPreview = `preview:${id}`;
          const canTest = Boolean(String(sampleData?.phone || '').replace(/\D/g, ''));
          return (
          <div key={id} className="card animate-in" style={{ animationDelay: `${0.02 * i}s` }}>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button
                  className="tpl-collapse"
                  onClick={() => setExpanded((p) => ({ ...p, [id]: !isExpanded }))}
                  title={isExpanded ? 'Recolher' : 'Expandir'}
                >
                  <RotateCw size={16} />
                </button>
                <MessageCircle size={18} color="#25D366" />
                <strong>{labelFor[id] || id}</strong>
                {isChanged && <span className="tpl-badge">Não salvo</span>}
                <span className="navi-mono-num">{raw.length} chars</span>
              </div>
              <div className="flex" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn-outline" onClick={() => copyText(raw, copyKeyRaw)} title="Copiar template (com variáveis)">
                  {copiedKey === copyKeyRaw ? <Check size={16} /> : <Copy size={16} />} Copiar
                </button>
                <button className="btn-outline" onClick={() => copyText(preview, copyKeyPreview)} title="Copiar preview (renderizado)">
                  {copiedKey === copyKeyPreview ? <Check size={16} /> : <Copy size={16} />} Copiar preview
                </button>
                <button className="btn-outline" onClick={() => handleResetOne(id)} disabled={saving}>
                  <RotateCcw size={16} /> Restaurar este
                </button>
              </div>
            </div>
            {isExpanded && (
              <>
                {id === 'birthday' && (
                  <p className="text-xs" style={{ marginBottom: 8, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Enviada automaticamente no aniversário do aluno (cron Zapster). Use {'{primeiroNome}'} e {'{nomeAcademia}'} — {'{nome}'} também é aceito (legado).
                  </p>
                )}
                <div className="tpl-vars">
                  <div className="navi-section-heading" style={{ fontSize: '0.82rem', marginBottom: 6 }}>Variáveis</div>
                  <div className="tpl-vars-scroll">
                    {PLACEHOLDERS.map((ph) => (
                      <button key={ph.key} className="tpl-chip" onClick={() => handleInsertPlaceholder(ph.key, id)} title={ph.label}>
                        {ph.key}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id={`tpl-${id}`}
                  className="form-input"
                  rows={4}
                  value={templates[id] || ''}
                  onChange={(e) => setTemplates((prev) => ({ ...prev, [id]: e.target.value }))}
                />
              </>
            )}
            <div className="tpl-preview">
              <div className="navi-section-heading" style={{ fontSize: '0.82rem', marginBottom: 6 }}>Preview</div>
              <div className="tpl-preview-box text-small">{preview || '—'}</div>
              <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-outline" onClick={() => openWhatsAppTest(preview)} disabled={!canTest} title="Abrir no WhatsApp com o lead de exemplo">
                  <Send size={16} /> Testar no WhatsApp
                </button>
              </div>
            </div>
          </div>
        )})}
        {filteredIds.length === 0 && (
          <div className="card" style={{ color: 'var(--text-secondary)' }}>
            Nenhum template encontrado para “{filter}”.
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .tpl-search { display: flex; align-items: center; gap: 8px; }
        .tpl-search .form-input { padding-left: 12px; }
        .tpl-badge {
          font-size: 0.7rem; font-weight: 800;
          background: var(--warning-light); color: var(--warning);
          padding: 3px 10px; border-radius: var(--radius-full);
        }
        .tpl-collapse {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--border-light); border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          padding: 0; min-height: auto; color: var(--text-secondary);
        }
        .tpl-collapse:hover { background: var(--border); }
        .tpl-vars { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
        .tpl-vars-scroll { display: flex; gap: 6px; overflow: auto; padding-bottom: 2px; }
        .tpl-chip {
          min-height: 26px; padding: 4px 8px; border-radius: var(--radius-full);
          background: var(--surface); border: 1px solid var(--border);
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
          white-space: nowrap;
        }
        .tpl-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .tpl-preview { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .tpl-preview-box {
          border: 1px solid var(--border);
          background: rgba(91, 63, 191, 0.04);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          white-space: pre-wrap;
          color: var(--text);
        }
        `
      }} />
    </div>
  );
};

export default Templates;
