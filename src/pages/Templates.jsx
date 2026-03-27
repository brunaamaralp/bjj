import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Save, RotateCcw, Send, User } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

const DEFAULT_TEMPLATES = {
  confirm: 'Olá {primeiroNome}! Confirmando sua aula experimental {dataAula}{horaAula}. Venha com roupa confortável! Qualquer dúvida, estamos à disposição.',
  reminder: 'Oi {primeiroNome}! Passando para lembrar da sua aula experimental {amanhaData}{horaAula}. Estamos te esperando!',
  post_class: '{primeiroNome}, foi um prazer ter você na nossa academia! O que achou da aula? Quer que eu te envie os valores e horários para começar?',
  missed: 'Oi {primeiroNome}! Sentimos sua falta na aula experimental. Sei que imprevistos acontecem! Quer remarcar para outro dia? Estamos com horários disponíveis essa semana.',
  recovery: 'Olá {primeiroNome}! Tudo bem? Vi que você visitou nossa academia recentemente. Ainda tem interesse em começar no Jiu-Jitsu? Temos turmas nos horários da manhã e noite. Vou adorar ajudar!',
  dashboard_contact: 'Olá {primeiroNome}! O que achou da aula experimental{dataAulaOpcional}? Quer que eu te envie os valores e horários para começar?'
};

const PLACEHOLDERS = [
  { key: '{primeiroNome}', label: 'Primeiro nome' },
  { key: '{dataAula}', label: 'Data da aula (DD/MM/AAAA)' },
  { key: '{horaAula}', label: 'Hora da aula (HH:MM)' },
  { key: '{amanhaData}', label: 'Texto “amanhã (DD/MM/AAAA)”' },
  { key: '{nomeAcademia}', label: 'Nome da academia' },
  { key: '{dataAulaOpcional}', label: 'Data opcional (prefixa “ do dia …”)' },
];

const labelFor = {
  confirm: 'Confirmar Aula',
  reminder: 'Lembrete',
  post_class: 'Pós-Aula',
  missed: 'Não Compareceu',
  recovery: 'Recuperação',
  dashboard_contact: 'Contato (Dashboard)',
};

const Templates = () => {
  const academyId = useLeadStore((s) => s.academyId);
  const { leads } = useLeadStore();
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [original, setOriginal] = useState(DEFAULT_TEMPLATES);
  const [sampleLeadId, setSampleLeadId] = useState('');
  const [academyName, setAcademyName] = useState('');
  const sampleLead = useMemo(() => leads.find(l => l.id === sampleLeadId) || leads[0] || null, [leads, sampleLeadId]);

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

  const renderTemplate = (text) => {
    const nomeAcademia = academyName || 'nossa academia';
    const nome = (sampleLead?.name || '').trim().split(/\s+/)[0] || 'Aluno';
    const dstr = sampleLead?.scheduledDate ? new Date(`${sampleLead.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '';
    const tstr = (sampleLead?.scheduledTime || '').trim();
    const dataOpcional = dstr ? ` do dia ${dstr}` : '';
    const amanhaTexto = dstr ? `amanhã (${dstr})` : 'amanhã';
    return String(text || '')
      .replaceAll('{primeiroNome}', nome)
      .replaceAll('{dataAula}', dstr)
      .replaceAll('{horaAula}', tstr ? ` às ${tstr}` : '')
      .replaceAll('{amanhaData}', amanhaTexto)
      .replaceAll('{nomeAcademia}', nomeAcademia)
      .replaceAll('{dataAulaOpcional}', dataOpcional);
  };

  const handleInsertPlaceholder = (key, id) => {
    setTemplates((prev) => {
      const cur = String(prev[id] || '');
      return { ...prev, [id]: cur + (cur.endsWith(' ') ? '' : ' ') + key };
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
    } catch (e) {
      console.error('save whatsappTemplates:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES);
  };

  const changed = JSON.stringify(templates) !== JSON.stringify(original);

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <div className="flex justify-between items-center">
        <h2>Templates de Mensagens</h2>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleResetDefaults}>
            <RotateCcw size={16} /> Restaurar padrão
          </button>
          <button className="btn-secondary" onClick={handleSave} disabled={!changed || saving}>
            <Save size={16} /> Salvar
          </button>
        </div>
      </div>

      <div className="card mt-3 animate-in">
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <User size={18} />
          <span className="text-small">Lead de exemplo para preview</span>
          <select
            className="form-input"
            value={sampleLeadId}
            onChange={(e) => setSampleLeadId(e.target.value)}
            style={{ marginLeft: 'auto', maxWidth: 260 }}
          >
            <option value="">(Primeiro da lista)</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-col gap-3 mt-3">
        {Object.keys(labelFor).map((id, i) => (
          <div key={id} className="card animate-in" style={{ animationDelay: `${0.02 * i}s` }}>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} color="#25D366" />
                <strong>{labelFor[id]}</strong>
              </div>
              <div className="flex gap-1">
                {PLACEHOLDERS.map(ph => (
                  <button key={ph.key} className="tpl-chip" onClick={() => handleInsertPlaceholder(ph.key, id)} title={ph.label}>
                    {ph.key}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="form-input"
              rows={3}
              value={templates[id] || ''}
              onChange={(e) => setTemplates((prev) => ({ ...prev, [id]: e.target.value }))}
            />
            <div className="flex justify-between items-center mt-2">
              <div className="preview-text text-small">
                Preview: {renderTemplate(templates[id])}
              </div>
              <button
                className="btn-outline"
                onClick={() => {
                  const text = renderTemplate(templates[id]);
                  const phone = (sampleLead?.phone || '').replace(/\D/g, '');
                  const url = `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
                  window.open(url, '_blank');
                }}
                disabled={!sampleLead}
                title="Abrir no WhatsApp com o lead de exemplo"
              >
                <Send size={16} /> Testar no WhatsApp
              </button>
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .tpl-chip {
          min-height: 26px; padding: 4px 8px; border-radius: var(--radius-full);
          background: var(--surface); border: 1px solid var(--border);
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
          margin-left: 6px;
        }
        .tpl-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .preview-text { color: var(--text-secondary); }
        `
      }} />
    </div>
  );
};

export default Templates;
