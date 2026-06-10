import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { fetchFollowupCopilot } from '../../lib/followupCopilotApi.js';
import { useToast } from '../../hooks/useToast';

export default function FollowupCopilotButtons({
  academyId,
  leadId,
  templateKey,
  nextAction,
  onDraftReady,
  compact = false,
}) {
  const toast = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryBullets, setSummaryBullets] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const lid = String(leadId || '').trim();
  const aid = String(academyId || '').trim();
  if (!lid || !aid) return null;

  const loadSummary = async () => {
    setLoadingSummary(true);
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
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadDraft = async () => {
    setLoadingDraft(true);
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
      onDraftReady?.(draft);
      toast.success('Texto sugerido — revise antes de enviar');
    } catch (e) {
      toast.error(e, 'action');
    } finally {
      setLoadingDraft(false);
    }
  };

  const btnClass = compact ? 'btn-outline followup-copilot-btn followup-copilot-btn--sm' : 'btn-outline followup-copilot-btn';

  return (
    <div className="followup-copilot">
      <div className="followup-copilot__actions">
        <button
          type="button"
          className={btnClass}
          disabled={loadingSummary || loadingDraft}
          onClick={() => void loadSummary()}
        >
          {loadingSummary ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          Resumo
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={loadingSummary || loadingDraft}
          onClick={() => void loadDraft()}
        >
          {loadingDraft ? <Loader2 size={14} className="wa-icon--spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          Sugerir texto
        </button>
      </div>
      {summaryOpen && summaryText ? (
        <div className="followup-copilot__panel" role="region" aria-label="Resumo do lead">
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
    </div>
  );
}
