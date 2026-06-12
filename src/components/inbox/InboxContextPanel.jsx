import '../../styles/inbox-context.css';
import React from 'react';
import { Flame } from 'lucide-react';
import ConversationNotesPanel from './ConversationNotesPanel';
import EmptyState from '../shared/EmptyState.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import InboxTriageCard from './InboxTriageCard.jsx';
import InboxTriageRestoreBanner from './InboxTriageRestoreBanner.jsx';
import InboxLinkStudentPanel from './InboxLinkStudentPanel.jsx';
import { INBOX_TICKET_BADGE_MAP } from '../../lib/inboxTicketBadges.js';
import { isLeadPendingTriage } from '../../lib/leadTriage.js';
import {
  buildInboxDisplayNameArgs,
  formatInboxPhone,
  inboxStudentSubtitle,
  isInboxGroupPhone,
} from '../../lib/inboxContactDisplay.js';
import {
  intentionDisplayLabel,
  priorityDisplayLabel,
} from '../../lib/whatsappClassificationLabels.js';
import { getPrimarySuggestedLeadAction } from '../../lib/leadClassificationActions.js';
import { suggestTriageAction, triageContextLine } from '../../lib/triageSuggestions.js';

export function InboxContextPanelContent(props) {
  const {
    selectedPhone,
    selected,
    ticketChip,
    updateTicket,
    ticketUpdating,
    loadThread,
    setLeadPanel,
    canConfigureAgenteIa,
    openPromptSettings,
    academyId,
    conversationIdForFlags,
    toast,
    leadById,
    leadByPhone,
    normalizePhone,
    pickDisplayName,
    contactLabel,
    navigate,
    linkingLead,
    leadPanel,
    leadNameDraft,
    setLeadNameDraft,
    leadTypeDraft,
    setLeadTypeDraft,
    convertToLead,
    transferToDraft,
    setTransferToDraft,
    teamMembers,
    confirmTransferConversation,
    leadSearch,
    setLeadSearch,
    fetchLeads,
    leadsLoading,
    leadCandidates,
    linkLeadToConversation,
    studentCandidates,
    studentsLoading,
    fetchStudents,
    onConfirmTriage,
    onDismissTriage,
    onOpenLinkStudent,
    onLinkStudentConfirm,
    triageBusy,
    activeContactLead,
    triageDismissed = false,
    onRestoreTriage,
    pinnedMessages,
    setSelectedMsgKey,
    scrollToMsgKey,
    isMobile,
    setDetailsOpen,
    selectedPhoneFlags,
    membershipPrimaryLabel,
    terms,
  } = props;

  return (
    <div className="inbox-context-panel__body">
      <div className="inbox-context-card">
        <div className="navi-section-heading inbox-context-card__heading">Conversa</div>
        <div className="inbox-context-stack inbox-context-stack--tight">
          <div className="inbox-context-kv">
            <span className="ctx-label ctx-label--inline">Telefone</span>
            <span className="navi-ui-count inbox-context-kv__value inbox-context-kv__value--break">
              {selectedPhone || '—'}
            </span>
          </div>
          <div className="inbox-context-kv">
            <span className="ctx-label ctx-label--inline">Status</span>
            {(() => {
              const chip = ticketChip(selected?.ticket_status, selected?.transfer_to);
              const statusKey = String(chip.status || selected?.ticket_status || 'in_progress').trim();
              return (
                <StatusBadge
                  status={statusKey}
                  map={{
                    ...INBOX_TICKET_BADGE_MAP,
                    [statusKey]: { label: chip.label, tone: chip.tone || 'info' },
                  }}
                  size="sm"
                />
              );
            })()}
          </div>
          {!!String(selected?.transfer_to || '').trim() && (
            <div className="inbox-context-kv">
              <span className="ctx-label ctx-label--inline">Transferido para</span>
              <span className="navi-ui-count inbox-context-kv__value">
                {String(selected?.transfer_to || '').trim()}
              </span>
            </div>
          )}
        </div>
        <div className="inbox-context-actions">
          <button
            className="btn btn-outline inbox-btn--ctx"
            type="button"
            onClick={() => updateTicket({ status: 'waiting_customer' })}
            disabled={!selectedPhone || ticketUpdating}
            title="Marca como aguardando resposta do cliente"
          >
            Aguardando cliente
          </button>
          <button
            className="btn btn-outline inbox-btn--ctx"
            onClick={() => loadThread(selectedPhone)}
            disabled={!selectedPhone}
            type="button"
          >
            Recarregar
          </button>
          <button
            className="btn btn-outline inbox-btn--ctx"
            type="button"
            onClick={() => setLeadPanel((v) => (v === 'transfer' ? null : 'transfer'))}
            disabled={!selectedPhone || ticketUpdating}
          >
            Transferir
          </button>
          {canConfigureAgenteIa && (
            <button className="btn btn-outline inbox-btn--ctx" onClick={openPromptSettings} type="button">
              Configurar IA
            </button>
          )}
        </div>
      </div>

      <ConversationNotesPanel academyId={academyId} conversationId={conversationIdForFlags} addToast={toast.addToast} />

      {leadPanel === 'link_student' ? (
        <InboxLinkStudentPanel
          contactName={pickDisplayName(
            buildInboxDisplayNameArgs({
              lead: activeContactLead,
              leadName: selected?.lead_name,
              manualContactName: selected?.contact_name,
              whatsappProfileName: selected?.whatsapp_profile_name,
              phone: String(selectedPhone || '').trim(),
            })
          )}
          leadSearch={leadSearch}
          setLeadSearch={setLeadSearch}
          studentCandidates={studentCandidates}
          studentsLoading={studentsLoading}
          fetchStudents={fetchStudents}
          onConfirm={onLinkStudentConfirm}
          onClose={() => setLeadPanel(null)}
          busy={triageBusy || linkingLead}
        />
      ) : null}

      {(() => {
        const phone = String(selectedPhone || '').trim();
        const leadId = String(selected?.lead_id || '').trim();
        const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
        if (!lead && !phone) return null;
        const displayArgs = buildInboxDisplayNameArgs({
          lead,
          leadName: selected?.lead_name,
          manualContactName: selected?.contact_name,
          whatsappProfileName: selected?.whatsapp_profile_name,
          phone,
        });
        const name = pickDisplayName(displayArgs);
        const studentSubtitle = inboxStudentSubtitle({
          leadName: displayArgs.leadName,
          displayName: name,
          parentName: displayArgs.parentName,
          leadType: displayArgs.leadType,
        });
        const status = String(lead?.status || '').trim();
        const intentionRaw = String(lead?.intention || lead?.whatsapp_intention || '').trim();
        const priorityRaw = String(lead?.priority || lead?.whatsapp_priority || '').trim();
        const intention = intentionRaw ? intentionDisplayLabel(intentionRaw, { terms }) : '';
        const priority = priorityRaw ? priorityDisplayLabel(priorityRaw) : '';
        const hotLead = Boolean(lead?.hotLead);
        const pendingTriage = Boolean(lead?.id && isLeadPendingTriage(lead));
        const triageSuggested = suggestTriageAction(lead);
        const triageContext = triageContextLine(lead, { terms });
        const suggestedAction = !pendingTriage ? getPrimarySuggestedLeadAction(lead, { terms }) : null;
        const studentLabel = terms?.student || 'Aluno';
        return (
          <div className="inbox-context-card">
            <div className="navi-section-heading inbox-context-card__heading">{`Contato / ${contactLabel}`}</div>
            <div className="inbox-context-stack">
              <div className="inbox-context-contact-name">{name || phone || '—'}</div>
              {studentSubtitle ? (
                <div className="navi-subtitle navi-subtitle--flush">
                  {studentLabel}: {studentSubtitle}
                </div>
              ) : null}
              {!!phone && (isInboxGroupPhone(phone) ? name && name !== formatInboxPhone(phone) : true) ? (
                <div className="navi-subtitle navi-subtitle--flush">{formatInboxPhone(phone)}</div>
              ) : null}
              <div className="inbox-context-chip-row">
                {!!status && !pendingTriage && <span className="text-small inbox-context-neutral-chip">{status}</span>}
                {!!intention && <span className="text-small inbox-context-neutral-chip">{intention}</span>}
                {!!priority && <span className="text-small inbox-context-neutral-chip">{priority}</span>}
                {hotLead && (
                  <span className="text-small inbox-hot-chip">
                    <Flame size={12} aria-hidden />
                    Quente
                  </span>
                )}
              </div>
              {pendingTriage && leadPanel !== 'link_student' ? (
                <InboxTriageCard
                  compact
                  busy={triageBusy || linkingLead}
                  suggestedAction={triageSuggested}
                  contextLine={triageContext}
                  studentLabel={studentLabel}
                  onConfirm={() => onConfirmTriage?.(lead)}
                  onLinkStudent={() => onOpenLinkStudent?.()}
                  onDismiss={() => onDismissTriage?.(lead)}
                />
              ) : null}
              {triageDismissed && !pendingTriage && leadPanel !== 'link_student' ? (
                <InboxTriageRestoreBanner
                  busy={triageBusy || linkingLead}
                  onRestore={onRestoreTriage}
                />
              ) : null}
              {suggestedAction && !pendingTriage ? (
                <button
                  type="button"
                  className="btn btn-outline inbox-btn--ctx inbox-context-suggested-action"
                  onClick={() => {
                    if (suggestedAction.id === 'assume_inbox' && phone) {
                      navigate(`/inbox?phone=${encodeURIComponent(phone)}`);
                      return;
                    }
                    if (suggestedAction.id === 'link_student') {
                      onOpenLinkStudent?.();
                      return;
                    }
                    if (lead?.id) navigate(`/lead/${encodeURIComponent(String(lead.id))}`);
                  }}
                >
                  {suggestedAction.label}
                </button>
              ) : null}
              <div className="inbox-context-btn-row">
                {!pendingTriage && !triageDismissed && !selected?.lead_id && !isInboxGroupPhone(phone) && (
                  <>
                    <button
                      className="btn btn-primary inbox-btn--ctx"
                      type="button"
                      onClick={() => setLeadPanel((v) => (v === 'convert' ? null : 'convert'))}
                      disabled={!selectedPhone || linkingLead}
                    >
                      Converter em contato
                    </button>
                    <button
                      className="btn btn-outline inbox-btn--ctx"
                      type="button"
                      onClick={() => setLeadPanel((v) => (v === 'associate' ? null : 'associate'))}
                      disabled={!selectedPhone || linkingLead}
                    >
                      Associar contato
                    </button>
                  </>
                )}
                {!!selected?.lead_id && (
                  <>
                    <button
                      className="btn btn-secondary inbox-btn--ctx"
                      onClick={() => navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`)}
                      type="button"
                    >
                      {`Ver ${contactLabel.toLowerCase()}`}
                    </button>
                    <button className="btn btn-outline inbox-btn--ctx" onClick={() => navigate('/pipeline')} type="button">
                      Funil
                    </button>
                  </>
                )}
                {!!lead?.id && !pendingTriage ? (
                  <button
                    className="btn btn-outline inbox-btn--ctx"
                    onClick={() => navigate(`/lead/${encodeURIComponent(String(lead.id))}`)}
                    type="button"
                  >
                    Perfil completo
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

      {leadPanel === 'convert' && !selected?.lead_id && (
        <div className="inbox-context-card">
          <div className="navi-section-heading inbox-context-card__heading">
            {`Converter em ${contactLabel.toLowerCase()}`}
          </div>
          <div className="inbox-context-stack">
            <div>
              <div className="ctx-label inbox-context-field">Nome</div>
              <input className="input" value={leadNameDraft} onChange={(e) => setLeadNameDraft(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <div className="ctx-label inbox-context-field">Tipo</div>
              <select className="input" value={leadTypeDraft} onChange={(e) => setLeadTypeDraft(e.target.value)}>
                <option value="Adulto">Adulto</option>
                <option value="Criança">Criança</option>
                <option value="Juniores">Juniores</option>
              </select>
            </div>
            <div className="inbox-context-btn-row inbox-context-btn-row--end">
              <button className="btn btn-outline inbox-btn--ctx" type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
                Fechar
              </button>
              <button className="btn btn-primary inbox-btn--ctx" onClick={convertToLead} disabled={linkingLead} type="button">
                {linkingLead ? 'Convertendo…' : 'Converter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {leadPanel === 'transfer' && selectedPhone ? (
        <div className="inbox-context-card">
          <div className="navi-section-heading inbox-context-card__heading">Transferir conversa</div>
          <p className="navi-subtitle navi-subtitle--spaced">
            O destinatário verá o status &quot;Transferido&quot; no ticket desta conversa.
          </p>
          <div className="inbox-context-stack">
            <div>
              <div className="ctx-label inbox-context-field">Atendente</div>
              <select
                className="input"
                value={transferToDraft}
                onChange={(e) => setTransferToDraft(e.target.value)}
                disabled={ticketUpdating || teamMembers.length === 0}
              >
                <option value="">Selecione…</option>
                {teamMembers.map((m) => {
                  const label = membershipPrimaryLabel(m);
                  return (
                    <option key={String(m.userId || m.$id || label)} value={label}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {teamMembers.length === 0 ? (
                <p className="text-small inbox-context-muted-block">Nenhum membro ativo na equipe.</p>
              ) : null}
            </div>
            <div className="inbox-context-btn-row inbox-context-btn-row--end">
              <button
                className="btn btn-outline inbox-btn--ctx"
                type="button"
                onClick={() => {
                  setLeadPanel(null);
                  setTransferToDraft('');
                }}
                disabled={ticketUpdating}
              >
                Fechar
              </button>
              <button
                className="btn btn-primary inbox-btn--ctx"
                type="button"
                onClick={() => void confirmTransferConversation()}
                disabled={ticketUpdating || !transferToDraft}
              >
                {ticketUpdating ? 'Transferindo…' : 'Confirmar transferência'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {leadPanel === 'associate' && !selected?.lead_id && (
        <div className="inbox-context-card">
          <div className="navi-section-heading inbox-context-card__heading">Associar contato</div>
          <div className="inbox-context-search-row">
            <input
              className="input"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone"
            />
            <button
              className="btn btn-outline inbox-btn--ctx"
              onClick={() => fetchLeads()}
              disabled={leadsLoading || linkingLead}
              type="button"
            >
              Atualizar
            </button>
          </div>
          {leadsLoading && <div className="text-small inbox-context-muted">Carregando…</div>}
          {!leadsLoading && leadCandidates.length === 0 && (
            <EmptyState variant="compact" tone="dashed" title="Nenhuma conversa encontrada." role="status" />
          )}
          {!leadsLoading && leadCandidates.length > 0 && (
            <div className="inbox-context-list">
              {leadCandidates.map((l) => (
                <button
                  key={l.id}
                  className="btn btn-outline inbox-context-list-item"
                  onClick={() => linkLeadToConversation({ leadId: l.id })}
                  disabled={linkingLead}
                  type="button"
                >
                  <span className="inbox-context-list-item__main">
                    <span className="inbox-context-list-item__title">{l.name || 'Sem nome'}</span>
                    <span className="text-small inbox-context-muted">{l.phone || ''}</span>
                  </span>
                  <span className="text-small inbox-context-muted">{l.pipelineStage || l.status || ''}</span>
                </button>
              ))}
            </div>
          )}
          <div className="inbox-context-btn-row inbox-context-btn-row--end inbox-context-footer-note">
            <button className="btn btn-outline inbox-btn--ctx" type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {selected?.summary?.text && (
        <div className="inbox-context-card">
          <div className="navi-section-heading inbox-context-card__heading">Resumo</div>
          <div className="navi-subtitle inbox-context-summary">{selected.summary.text}</div>
        </div>
      )}

      <div className="inbox-context-card">
        <div className="inbox-context-pinned-header">
          <div className="navi-section-heading">Fixadas</div>
          <span className="navi-ui-count">{pinnedMessages.length}</span>
        </div>
        {pinnedMessages.length === 0 ? (
          <EmptyState variant="bare" title="Nenhuma mensagem fixada." role="status" />
        ) : (
          <div className="inbox-context-list">
            {pinnedMessages.map((pm) => (
              <button
                key={pm.key}
                type="button"
                className="btn btn-outline inbox-context-list-item inbox-context-list-item--compact"
                onClick={() => {
                  setSelectedMsgKey(pm.key);
                  scrollToMsgKey(pm.key);
                  if (isMobile) setDetailsOpen(false);
                }}
              >
                <span className="inbox-context-list-item__preview">{pm.preview || '—'}</span>
                <span className="text-small inbox-context-muted">Ver</span>
              </button>
            ))}
          </div>
        )}
        <div className="inbox-context-footer-note">
          <div className="text-small inbox-context-muted">
            Importantes: {Object.keys(selectedPhoneFlags?.important || {}).length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxContextPanel(props) {
  const { isMobile, setContextOpen, ...contentProps } = props;

  return (
    <div className="inbox-context-panel">
      <div className="inbox-context-panel__header">
        <div className="navi-section-heading">Detalhes</div>
        {!isMobile ? (
          <button className="btn btn-outline navi-btn--toolbar" type="button" onClick={() => setContextOpen(false)}>
            Ocultar painel
          </button>
        ) : null}
      </div>
      <div className="inbox-context-panel-scroll">
        <InboxContextPanelContent {...contentProps} />
      </div>
    </div>
  );
}
