import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { fetchFollowupCopilot, fetchLeadSummaryPeek, openWhatsappDraft } from '../../lib/followupCopilotApi.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useToast } from '../../hooks/useToast';
import { useAnchoredMenuPosition } from '../../hooks/useAnchoredMenuPosition.js';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../shared/menu';

function formatSummaryGeneratedAt(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  prefetchSummary = true,
}) {
  const toast = useToast();
  const aiEnabled = useLeadStore((s) => s.modules?.aiEnabled !== false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryMeta, setSummaryMeta] = useState({
    generatedAt: '',
    stale: false,
    fromCache: false,
    pontosChave: [],
    pendencias: [],
  });
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peekReady, setPeekReady] = useState(false);
  const menuTriggerRef = useRef(null);
  const menuPanelStyle = useAnchoredMenuPosition(menuTriggerRef, menuOpen, {
    align: 'start',
    gap: 6,
    maxHeight: 200,
    minWidth: 168,
    zIndex: 'var(--menu-z-elevated, 9000)',
  });

  const lid = String(leadId || '').trim();
  const aid = String(academyId || '').trim();
  if (!lid || !aid || aiEnabled === false) return null;

  const recordDraftAudit = async (mode, text, tplKey) => {
    try {
      await addLeadEvent({
        academyId: aid,
        leadId: lid,
        type: 'ai_followup_draft',
        text: mode === 'draft' ? 'Rascunho IA' : 'Resumo IA',
        payloadJson: {
          mode,
          templateKey: String(tplKey || '').trim(),
          draftPreview: String(text || '').slice(0, 200),
        },
      });
    } catch {
      /* audit não bloqueia UX */
    }
  };

  const btnClass = compact ? 'btn-outline followup-copilot-btn followup-copilot-btn--sm' : 'btn-outline followup-copilot-btn';

  const applySummaryResponse = (data, { forceRefresh }) => {
    setSummaryText(String(data.summary || '').trim());
    setSummaryMeta({
      generatedAt: String(data.generated_at || '').trim(),
      stale: data.stale === true,
      fromCache: data.from_cache === true,
      pontosChave: Array.isArray(data.pontos_chave) ? data.pontos_chave : [],
      pendencias: Array.isArray(data.pendencias_mencionadas) ? data.pendencias_mencionadas : [],
    });
    setSummaryOpen(true);
    if (!data.from_cache || forceRefresh) {
      void recordDraftAudit('summary', data.summary, templateKey);
    }
  };

  useEffect(() => {
    if (!prefetchSummary || !lid || !aid) return undefined;
    let cancelled = false;
    void fetchLeadSummaryPeek({ academyId: aid, leadId: lid })
      .then((data) => {
        if (cancelled || !data?.has_cache || !data.summary) return;
        setSummaryText(String(data.summary || '').trim());
        setSummaryMeta({
          generatedAt: String(data.generated_at || '').trim(),
          stale: data.stale === true,
          fromCache: true,
          pontosChave: Array.isArray(data.pontos_chave) ? data.pontos_chave : [],
          pendencias: Array.isArray(data.pendencias_mencionadas) ? data.pendencias_mencionadas : [],
        });
      })
      .catch(() => {
        /* prefetch silencioso */
      })
      .finally(() => {
        if (!cancelled) setPeekReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [prefetchSummary, lid, aid]);

  const loadSummary = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh && summaryText && peekReady && !summaryMeta.stale) {
      setSummaryOpen(true);
      setDraftOpen(false);
      return;
    }
    if (forceRefresh) setRefreshingSummary(true);
    else setLoadingSummary(true);
    setDraftOpen(false);
    try {
      const data = await fetchFollowupCopilot({
        academyId: aid,
        leadId: lid,
        mode: 'summary',
        forceRefresh,
      });
      applySummaryResponse(data, { forceRefresh });
    } catch (e) {
      toast.error(e, 'action');
      toast.info('Use o botão verde de WhatsApp para o template padrão.');
    } finally {
      setLoadingSummary(false);
      setRefreshingSummary(false);
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
      void recordDraftAudit('draft', draft, templateKey || 'dashboard_contact');
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
    void recordDraftAudit('draft_sent', text, templateKey || 'dashboard_contact');
    if (openWhatsappDraft(leadPhone, text)) return;
    toast.warning('Telefone ausente ou inválido.');
  };

  const generatedLabel = formatSummaryGeneratedAt(summaryMeta.generatedAt);

  return (
    <div className="followup-copilot">
      {showTemplateHint ? (
        <p className="followup-copilot__hint">
          Template padrão: botão verde · Rascunho IA: personaliza o texto antes de enviar
        </p>
      ) : null}
      {peekReady && summaryText && !summaryOpen ? (
        <button
          type="button"
          className="followup-copilot__peek-link"
          onClick={() => setSummaryOpen(true)}
        >
          {summaryMeta.stale ? 'Resumo salvo (desatualizado) — ver' : 'Resumo salvo — ver'}
        </button>
      ) : null}
      {menuMode ? (
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="followup-copilot-menu"
          align="start"
          dismissExtraSelector="[data-followup-copilot-menu]"
        >
          <button
            ref={menuTriggerRef}
            type="button"
            className="fu-ia-btn"
            disabled={loadingSummary || loadingDraft || refreshingSummary}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Ações de IA"
            title="Resumo e rascunho com IA"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {loadingSummary || loadingDraft || refreshingSummary ? (
              <Loader2 size={14} className="fu-ia-btn__icon fu-ia-btn__icon--spin" aria-hidden />
            ) : (
              <Sparkles size={14} className="fu-ia-btn__icon" aria-hidden />
            )}
          </button>
          {menuOpen && menuPanelStyle
            ? createPortal(
                <DropdownMenuPanel
                  fixed
                  elevated
                  aria-label="Ações de IA"
                  className="followup-copilot-menu__panel"
                  style={menuPanelStyle}
                  data-followup-copilot-menu
                >
                  <DropdownMenuItem
                    icon={<Sparkles size={14} aria-hidden />}
                    disabled={loadingSummary || loadingDraft || refreshingSummary}
                    onClick={() => {
                      setMenuOpen(false);
                      void loadSummary();
                    }}
                  >
                    Resumo IA
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Sparkles size={14} aria-hidden />}
                    disabled={loadingSummary || loadingDraft || refreshingSummary}
                    onClick={() => {
                      setMenuOpen(false);
                      void loadDraft();
                    }}
                  >
                    Rascunho IA
                  </DropdownMenuItem>
                </DropdownMenuPanel>,
                document.body
              )
            : null}
        </DropdownMenu>
      ) : (
        <div className="followup-copilot__actions">
          <button
            type="button"
            className={btnClass}
            disabled={loadingSummary || loadingDraft || refreshingSummary}
            onClick={() => void loadSummary()}
          >
            {loadingSummary ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            Resumo IA
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={loadingSummary || loadingDraft || refreshingSummary}
            onClick={() => void loadDraft()}
          >
            {loadingDraft ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            Rascunho IA
          </button>
        </div>
      )}
      {loadingSummary ? (
        <div className="followup-copilot__panel" role="status" aria-live="polite" aria-busy="true">
          Carregando resumo…
        </div>
      ) : null}
      {refreshingSummary ? (
        <div className="followup-copilot__panel" role="status" aria-live="polite" aria-busy="true">
          Gerando resumo…
        </div>
      ) : null}
      {summaryOpen && summaryText ? (
        <div className="followup-copilot__panel" role="region" aria-label="Resumo do lead" aria-live="polite">
          <div className="followup-copilot__summary-meta">
            {generatedLabel ? <span className="text-small">Gerado em {generatedLabel}</span> : null}
            {summaryMeta.stale ? (
              <span className="followup-copilot__stale-badge" role="status">
                Desatualizado
              </span>
            ) : null}
          </div>
          <p className="followup-copilot__summary">{summaryText}</p>
          {summaryMeta.pontosChave.length > 0 ? (
            <ul className="followup-copilot__summary-points">
              {summaryMeta.pontosChave.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {summaryMeta.pendencias.length > 0 ? (
            <div className="followup-copilot__summary-pending">
              <span className="text-small">Pendências mencionadas:</span>
              <ul className="followup-copilot__summary-points">
                {summaryMeta.pendencias.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="followup-copilot__summary-actions">
            {summaryMeta.stale ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={refreshingSummary}
                onClick={() => void loadSummary({ forceRefresh: true })}
              >
                Atualizar
              </button>
            ) : null}
            <button type="button" className="followup-copilot__close" onClick={() => setSummaryOpen(false)}>
              Fechar
            </button>
          </div>
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
