import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { fetchFollowupCopilot, openWhatsappDraft } from '../../lib/followupCopilotApi.js';
import { useToast } from '../../hooks/useToast';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../shared/menu';

export default function FollowupCopilotButtons({
  academyId,
  leadId,
  leadPhone,
  templateKey,
  nextAction,
  onDraftReady,
  compact = false,
  menuMode = false,
  showTemplateHint = false,
}) {
  const toast = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryBullets, setSummaryBullets] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const lid = String(leadId || '').trim();
  const aid = String(academyId || '').trim();
  if (!lid || !aid) return null;

  const btnClass = compact ? 'btn-outline followup-copilot-btn followup-copilot-btn--sm' : 'btn-outline followup-copilot-btn';

  const loadSummary = async () => {
    setLoadingSummary(true);
    setDraftOpen(false);
    try {
      const data = await fetchFollowupCopilot({
        academyId: aid,
        leadId: lid,
        mode: 'summary',
        nextAction,
      });
      setSummaryText(String(data.summary || '').trim());
      setSummaryBullets(Array.isArray(data.bullets) ? data.bullets : []);
      setSummaryOpen(true);
    } catch (e) {
      toast.error(e, 'action');
      toast.info('Use o botão verde de WhatsApp para o template padrão.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadDraft = async () => {
    setLoadingDraft(true);
    setSummaryOpen(false);
    try {
      const data = await fetchFollowupCopilot({
        academyId: aid,
        leadId: lid,
        mode: 'draft',
        templateKey: templateKey || 'dashboard_contact',
        nextAction,
      });
      const draft = String(data.draft || '').trim();
      if (!draft) throw new Error('Resposta vazia');
      setDraftPreview(draft);
      setDraftOpen(true);
      onDraftReady?.(draft);
    } catch (e) {
      toast.error(e, 'action');
      toast.info('Use o botão verde de WhatsApp para o template padrão.');
    } finally {
      setLoadingDraft(false);
    }
  };

  const openDraftInWhatsapp = () => {
    const text = String(draftPreview || '').trim();
    if (!text) return;
    if (openWhatsappDraft(leadPhone, text)) return;
    toast.warning('Telefone ausente ou inválido.');
  };

  return (
    <div className="followup-copilot">
      {showTemplateHint ? (
        <p className="followup-copilot__hint">
          Template padrão: botão verde · Rascunho IA: personaliza o texto antes de enviar
        </p>
      ) : null}
      {menuMode ? (
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="followup-copilot-menu"
          align="start"
        >
          <button
            type="button"
            className={`${btnClass} followup-copilot-menu__trigger`}
            disabled={loadingSummary || loadingDraft}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {loadingSummary || loadingDraft ? (
              <Loader2 size={14} className="wa-icon--spin" aria-hidden />
            ) : (
              <Sparkles size={14} aria-hidden />
            )}
            IA
            <ChevronDown size={14} aria-hidden />
          </button>
          {menuOpen ? (
            <DropdownMenuPanel aria-label="Ações de IA">
              <DropdownMenuItem
                icon={<Sparkles size={14} aria-hidden />}
                disabled={loadingSummary || loadingDraft}
                onClick={() => {
                  setMenuOpen(false);
                  void loadSummary();
                }}
              >
                Resumo IA
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<Sparkles size={14} aria-hidden />}
                disabled={loadingSummary || loadingDraft}
                onClick={() => {
                  setMenuOpen(false);
                  void loadDraft();
                }}
              >
                Rascunho IA
              </DropdownMenuItem>
            </DropdownMenuPanel>
          ) : null}
        </DropdownMenu>
      ) : (
        <div className="followup-copilot__actions">
          <button
            type="button"
            className={btnClass}
            disabled={loadingSummary || loadingDraft}
            onClick={() => void loadSummary()}
          >
            {loadingSummary ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            Resumo IA
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={loadingSummary || loadingDraft}
            onClick={() => void loadDraft()}
          >
            {loadingDraft ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            Rascunho IA
          </button>
        </div>
      )}
      {loadingSummary ? (
        <div className="followup-copilot__panel" role="status" aria-live="polite" aria-busy="true">
          Gerando resumo…
        </div>
      ) : null}
      {summaryOpen && summaryText ? (
        <div className="followup-copilot__panel" role="region" aria-label="Resumo do lead" aria-live="polite">
          <p className="followup-copilot__summary">{summaryText}</p>
          {summaryBullets.length > 0 ? (
            <ul className="followup-copilot__bullets">
              {summaryBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="followup-copilot__close" onClick={() => setSummaryOpen(false)}>
            Fechar
          </button>
        </div>
      ) : null}
      {draftOpen && draftPreview ? (
        <div className="followup-copilot__panel" role="region" aria-label="Rascunho sugerido" aria-live="polite">
          <span className="followup-copilot__draft-label">Revise antes de enviar</span>
          <textarea
            className="input followup-copilot__draft-preview"
            value={draftPreview}
            onChange={(e) => setDraftPreview(e.target.value)}
            rows={4}
          />
          <div className="followup-copilot__draft-actions">
            <button type="button" className="btn btn-outline" onClick={openDraftInWhatsapp}>
              Abrir no WhatsApp
            </button>
            <button type="button" className="followup-copilot__close" onClick={() => setDraftOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
