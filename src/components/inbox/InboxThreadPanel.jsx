import React from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import ThreadState from './ThreadState';
import ThreadSkeleton from './ThreadSkeleton';
import InboxComposer from './InboxComposer';
import InboxThreadActionsMenu from './InboxThreadActionsMenu.jsx';
import InboxThreadMessages from './InboxThreadMessages.jsx';
import InboxTriageCard from './InboxTriageCard.jsx';
import InboxFollowupBanner from './InboxFollowupBanner.jsx';
import ContactAvatar from '../shared/ContactAvatar.jsx';
import { inboxProfileImageUrl } from '../../lib/inboxContactDisplay.js';
import { suggestTriageAction, triageContextLine } from '../../lib/triageSuggestions.js';

export default function InboxThreadPanel(props) {
  const {
    selectedPhone,
    setSelectedPhone,
    setDetailsOpen,
    isMobile,
    selected,
    leadById,
    leadByPhone,
    normalizePhone,
    pickDisplayName,
    formatPhone,
    handoffReleaseHint,
    editingContactName,
    contactNameDraft,
    setContactNameDraft,
    saveContactName,
    savingContactName,
    setEditingContactName,
    pendingTriage = false,
    activeContactLead = null,
    onConfirmTriage,
    onDismissTriage,
    onOpenLinkStudent,
    triageBusy = false,
    followupState = null,
    onFollowupSendTemplate,
    onCompleteFollowup,
    completingFollowup = false,
    leadPanel = null,
    setLeadPanel,
    linkingLead = false,
    academyId = '',
    aiEnabled = true,
    terms = null,
    menu,
    openMenu,
    threadActionsMenuProps,
    threadScrollRef,
    threadMessagesApiRef,
    onThreadScroll,
    threadHasMore,
    threadLoading,
    loadThread,
    selectedPhoneRef,
    threadPaging,
    threadCursor,
    error,
    threadError,
    threadMessagesEmptyUi,
    waChatConnected,
    threadBlocks,
    expandedMsgs,
    setExpandedMsgs,
    inboxMessageMediaUrl,
    selectedMsgKey,
    setSelectedMsgKey,
    selectedPhoneFlags,
    senderKindFromMessage,
    setImageLightboxUrl,
    formatWhen,
    formatTimeOnly,
    copyToClipboard,
    setHandoffActive,
    setHandoffReleaseHint,
    cancelScheduledMessage,
    cancelingMsgId,
    waSyncing,
    reconcileLast24h,
    setDraft,
    textareaRef,
    threadAtBottom,
    newMsgCount,
    scrollThreadToBottom,
    ticketUpdating,
    updateTicket,
    showInboxKeyHints,
    isNarrowDesktop,
    setContextOpen,
    composerProps,
    ticketChip,
    handoffDurationPhrase,
    retryFailedMessage,
  } = props;

  if (!selectedPhone) {
    return (
    <div className="inbox-empty-thread-placeholder">
      <EmptyState
        variant="embedded"
        tone="dashed"
        icon={MessageSquare}
        title="Nenhuma conversa selecionada"
        description="Escolha uma conversa à esquerda para ver o histórico e responder o contato."
        role="status"
      />
    </div>
    );
  }

  return (
    <div className="inbox-thread-panel">
      <div className="inbox-thread-header">
        <div className="inbox-thread-header__row inbox-thread-header__row--primary">
          {isMobile ? (
            <button
              className="inbox-thread-header__back"
              onClick={() => {
                setSelectedPhone('');
                setDetailsOpen(false);
              }}
              type="button"
              aria-label="Voltar para lista de conversas"
            >
              <ArrowLeft size={22} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
            <div className="inbox-thread-header__identity">
            {(() => {
              const phone = String(selectedPhone || '').trim();
              const leadId = String(selected?.lead_id || '').trim();
              const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
              const name = pickDisplayName({
                leadName: String(lead?.name || '').trim() || String(selected?.lead_name || '').trim(),
                manualContactName: selected?.contact_name,
                whatsappProfileName: selected?.whatsapp_profile_name,
                phone,
              });
              const formattedPhone =
                phone && typeof formatPhone === 'function' ? String(formatPhone(phone) || '').trim() : '';
              const displayName = name || formattedPhone || phone || '—';
              const profileImageUrl = inboxProfileImageUrl(selected);
              const showPhoneLine = Boolean(name && formattedPhone && formattedPhone !== name);
              const ticket = ticketChip(selected?.ticket_status, selected?.transfer_to);
              const leadIdForHint = String(selected?.lead_id || '').trim();
              const leadForHint = leadIdForHint ? leadById.get(leadIdForHint) : leadByPhone.get(normalizePhone(phone));
              const aiSuggestHuman = Boolean(leadForHint?.needHuman);
              const showTicketLine = Boolean(ticket?.label) && !ticket?.isDefault;
              return (
                <>
                  <div className="inbox-thread-header__avatar" aria-hidden>
                    <ContactAvatar
                      contact={{ name: displayName, avatar_url: profileImageUrl }}
                      size={36}
                      fill
                    />
                  </div>
                  <div className="inbox-thread-header__intro">
                    <div className="inbox-thread-header__title">
                      {displayName}
                      {pendingTriage ? (
                        <span className="inbox-thread-header__triage-badge" title="Aguardando triagem WhatsApp">
                          Triagem
                        </span>
                      ) : null}
                    </div>
                    {showPhoneLine ? (
                      <div className="inbox-thread-header__phone">{formattedPhone}</div>
                    ) : null}
                    {showTicketLine ? (
                      <div className="inbox-thread-header__status-line">{ticket.label}</div>
                    ) : null}
                    {handoffReleaseHint ? (
                      <div
                        role="status"
                        className="inbox-thread-handoff-banner inbox-thread-handoff-banner--release"
                      >
                        A IA voltará a responder automaticamente
                      </div>
                    ) : null}
                    {!selected?.need_human && aiSuggestHuman ? (
                      <p className="inbox-thread-header__hint">
                        Vale a pena alguém da equipe ver esta conversa
                      </p>
                    ) : null}
                    {!selected?.lead_id && !pendingTriage ? (
                      editingContactName ? (
                        <div className="inbox-thread-header__subline inbox-thread-header__subline--edit">
                          <input
                            id="inbox-contact-name-input"
                            className="input inbox-thread-header__name-input"
                            aria-label="Nome do contato"
                            value={contactNameDraft}
                            onChange={(e) => setContactNameDraft(e.target.value)}
                            placeholder="Nome do contato"
                            autoComplete="name"
                          />
                          <button
                            type="button"
                            className="btn btn-outline inbox-thread-header__name-btn"
                            onClick={() => void saveContactName()}
                            disabled={savingContactName}
                          >
                            {savingContactName ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline inbox-thread-header__name-btn"
                            onClick={() => {
                              setEditingContactName(false);
                              setContactNameDraft('');
                            }}
                            disabled={savingContactName}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="inbox-thread-header__meta-line">
                          <span className="inbox-thread-header__meta-muted">Sem contato</span>
                          <span className="inbox-thread-header__meta-sep" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            className="inbox-thread-header__subtitle-link"
                            disabled={linkingLead}
                            onClick={() => {
                              setLeadPanel?.('convert');
                              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                              else setContextOpen?.(true);
                            }}
                          >
                            Vincular
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>
                </>
              );
            })()}
            </div>
          <div className="inbox-thread-header-actions inbox-thread-header-actions--wa">
            {String(selected?.ticket_status || '').trim().toLowerCase() !== 'resolved' ? (
              <button
                type="button"
                className="inbox-thread-header__action-btn inbox-thread-header__action-btn--secondary"
                disabled={!selectedPhone || ticketUpdating}
                onClick={() => void updateTicket({ status: 'resolved' })}
                title="Resolver conversa"
              >
                Resolver
                {showInboxKeyHints ? (
                  <span className="inbox-thread-quick-toolbar__key-hint" aria-hidden>
                    E
                  </span>
                ) : null}
              </button>
            ) : null}
            {!selected?.need_human ? (
              <button
                className="inbox-thread-header__action-btn inbox-thread-header__action-btn--secondary"
                onClick={() => setHandoffActive(true)}
                disabled={!selectedPhone}
                type="button"
                title={`Pausa o agente por ${handoffDurationPhrase}`}
              >
                Assumir
              </button>
            ) : (
              <button
                className="inbox-thread-header__action-btn inbox-thread-header__action-btn--primary"
                onClick={() => {
                  setHandoffReleaseHint(true);
                  void setHandoffActive(false);
                }}
                disabled={!selectedPhone}
                type="button"
                title="Reativa o agente agora"
              >
                Devolver
              </button>
            )}
            <InboxThreadActionsMenu {...threadActionsMenuProps} />
          </div>
        </div>
      </div>

      {pendingTriage && leadPanel !== 'link_student' ? (
        <div className="inbox-thread-triage-banner" data-no-dnd="true">
          <InboxTriageCard
            busy={triageBusy}
            suggestedAction={suggestTriageAction(activeContactLead)}
            contextLine={triageContextLine(activeContactLead, { terms })}
            studentLabel={terms?.student || 'Aluno'}
            onConfirm={() => onConfirmTriage?.(activeContactLead)}
            onLinkStudent={() => onOpenLinkStudent?.()}
            onDismiss={() => onDismissTriage?.(activeContactLead)}
          />
        </div>
      ) : null}

      {followupState && !pendingTriage ? (
        <InboxFollowupBanner
          followupState={followupState}
          leadId={String(activeContactLead?.id || selected?.lead_id || '').trim()}
          academyId={academyId}
          leadPhone={activeContactLead?.phone || selectedPhone}
          aiEnabled={aiEnabled}
          onSendTemplate={onFollowupSendTemplate}
          onCompleteFollowup={onCompleteFollowup}
          completing={completingFollowup}
        />
      ) : null}

      <div className="inbox-thread-body">
        <div
          ref={threadScrollRef}
          onScroll={onThreadScroll}
          className="inbox-thread-messages"
        >
          {threadHasMore && !threadLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px', minHeight: 34 }}
                onClick={() => loadThread(selectedPhoneRef.current, { silent: true, cursor: String(threadCursor || ''), append: true })}
                disabled={threadPaging || !threadCursor}
                type="button"
              >
                {threadPaging ? 'Carregando…' : 'Carregar mensagens anteriores'}
              </button>
            </div>
          )}
          {threadLoading && (!Array.isArray(threadBlocks) || threadBlocks.length === 0) ? (
            <ThreadSkeleton />
          ) : null}
          {!threadLoading && (error || threadError) && (
            <ThreadState
              type="error"
              errorText={error || threadError}
              onRetry={() => loadThread(selectedPhone)}
            />
          )}
          {threadMessagesEmptyUi && !waChatConnected && <ThreadState type="empty" />}

          {Array.isArray(threadBlocks) && threadBlocks.length > 0 ? (
            <InboxThreadMessages
              ref={threadMessagesApiRef}
              scrollElementRef={threadScrollRef}
              threadBlocks={threadBlocks}
              expandedMsgs={expandedMsgs}
              selectedPhone={selectedPhone}
              selectedPhoneRef={selectedPhoneRef}
              selectedMsgKey={selectedMsgKey}
              setSelectedMsgKey={setSelectedMsgKey}
              setExpandedMsgs={setExpandedMsgs}
              menu={menu}
              openMenu={openMenu}
              formatWhen={formatWhen}
              formatTimeOnly={formatTimeOnly}
              copyToClipboard={copyToClipboard}
              inboxMessageMediaUrl={inboxMessageMediaUrl}
              selectedPhoneFlags={selectedPhoneFlags}
              senderKindFromMessage={senderKindFromMessage}
              setImageLightboxUrl={setImageLightboxUrl}
              reconcileLast24h={reconcileLast24h}
              waSyncing={waSyncing}
              setDraft={setDraft}
              textareaRef={textareaRef}
              cancelScheduledMessage={cancelScheduledMessage}
              cancelingMsgId={cancelingMsgId}
              retryFailedMessage={retryFailedMessage}
            />
          ) : null}

          {threadMessagesEmptyUi && waChatConnected && (
            <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
              <EmptyState
                variant="embedded"
                tone="dashed"
                icon={MessageSquare}
                title="Nenhuma mensagem ainda"
                description='Se já há mensagens no WhatsApp, clique em "Sincronizar" para importar as últimas 24h (limite do plano Zapster).'
                role="status"
              />
              <div className="inbox-thread-empty-actions">
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', minHeight: 34 }}
                  type="button"
                  disabled={waSyncing}
                  onClick={reconcileLast24h}
                >
                  {waSyncing ? 'Sincronizando…' : '↻ Sincronizar com WhatsApp'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', minHeight: 34 }}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => String(prev || '').trim() ? prev : 'Olá! Como posso te ajudar hoje?');
                    try {
                      textareaRef.current && textareaRef.current.focus && textareaRef.current.focus();
                    } catch {
                      void 0;
                    }
                  }}
                >
                  Enviar primeira mensagem
                </button>
              </div>
            </div>
          )}
        </div>

        {!threadAtBottom && newMsgCount > 0 && (
          <div
            style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
            aria-live="polite"
            aria-atomic="true"
          >
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', minHeight: 34, pointerEvents: 'auto', fontVariantNumeric: 'tabular-nums' }}
              type="button"
              onClick={() => scrollThreadToBottom({ clearNew: true })}
              title="Ir para o mais recente"
              aria-label={`${newMsgCount} mensagens novas. Ir para o mais recente`}
            >
              {newMsgCount} novas • Ir para o mais recente
            </button>
          </div>
        )}
      </div>


      <InboxComposer {...composerProps} />
    </div>
  );
}
