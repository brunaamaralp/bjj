import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { fetchFollowupCopilot, fetchLeadSummaryPeek } from '../../lib/followupCopilotApi.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useToast } from '../../hooks/useToast';

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
  templateKey,
  compact = false,
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
  const [peekReady, setPeekReady] = useState(false);

  const lid = String(leadId || '').trim();
  const aid = String(academyId || '').trim();
  const enabled = Boolean(lid && aid && aiEnabled !== false);

  const recordSummaryAudit = async (text, tplKey) => {
    try {
      await addLeadEvent({
        academyId: aid,
        leadId: lid,
        type: 'ai_followup_draft',
        text: 'Resumo IA',
        payloadJson: {
          mode: 'summary',
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
      void recordSummaryAudit(data.summary, templateKey);
    }
  };

  useEffect(() => {
    if (!enabled || !prefetchSummary) return undefined;
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
  }, [enabled, prefetchSummary, lid, aid]);

  const loadSummary = async ({ forceRefresh = false } = {}) => {
    if (!enabled) return;
    if (!forceRefresh && summaryText && peekReady && !summaryMeta.stale) {
      setSummaryOpen(true);
      return;
    }
    if (forceRefresh) setRefreshingSummary(true);
    else setLoadingSummary(true);
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

  const generatedLabel = formatSummaryGeneratedAt(summaryMeta.generatedAt);

  if (!enabled) return null;

  return (
    <div className="followup-copilot">
      {peekReady && summaryText && !summaryOpen ? (
        <button
          type="button"
          className="followup-copilot__peek-link"
          onClick={() => setSummaryOpen(true)}
        >
          {summaryMeta.stale ? 'Resumo salvo (desatualizado) — ver' : 'Resumo salvo — ver'}
        </button>
      ) : null}
      <button
        type="button"
        className={btnClass}
        disabled={loadingSummary || refreshingSummary}
        onClick={() => void loadSummary()}
        title="Resumo da conversa com IA"
      >
        {loadingSummary ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
        Resumo IA
      </button>
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
    </div>
  );
}
