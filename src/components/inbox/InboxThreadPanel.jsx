import React from 'react';
import { MessageSquare } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import ThreadState from './ThreadState';
import ThreadSkeleton from './ThreadSkeleton';
import InboxComposer from './InboxComposer';
import InboxThreadActionsMenu from './InboxThreadActionsMenu.jsx';
import InboxThreadMessages from './InboxThreadMessages.jsx';
import InboxTriageCard from './InboxTriageCard.jsx';
import { getThreadHandoffBanner } from '../../../lib/inboxHandoffPresentation.js';

function inboxDisplayInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  const one = parts[0] || '?';
  return one.slice(0, 2).toUpperCase();
}

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
    nowMs,
    handoffReleaseHint,
    editingContactName,
    contactNameDraft,
    setContactNameDraft,
    saveContactName,
    savingContactName,
    setEditingContactName,
    navigate,
    contactLabel,
    terms,
    pendingTriage = false,
    activeContactLead = null,
    onConfirmTriage,
    onDismissTriage,
    onOpenLinkStudent,
    triageBusy = false,
    setLeadPanel,
    linkingLead = false,
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
    inboxContentIsAudioPlaceholder,
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
    inboxThreadNarrow767,
    isNarrowDesktop,
    setContextOpen,
    contextOpen = false,
    composerProps,
    ticketChip,
    listFilter,
    unarchiveConversation,
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
        <div className="inbox-thread-header__row">
          {isMobile && (
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
              onClick={() => {
                setSelectedPhone('');
                setDetailsOpen(false);
              }}
              type="button"
            >
              Voltar
            </button>
          )}
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
              const displayName = name || phone || '—';
              const profileUrl = String(
                selected?.whatsapp_profile_image_url || lead?.whatsapp_profile_image_url || ''
              ).trim();
              const ticket = ticketChip(selected?.ticket_status, selected?.transfer_to);
              const banner = getThreadHandoffBanner({
                needHuman: Boolean(selected?.need_human),
                humanHandoffUntil: selected?.human_handoff_until,
                nowMs,
              });
              const leadIdForHint = String(selected?.lead_id || '').trim();
              const leadForHint = leadIdForHint ? leadById.get(leadIdForHint) : leadByPhone.get(normalizePhone(phone));
              const aiSuggestHuman = Boolean(leadForHint?.needHuman);
              const showTicketLine = Boolean(ticket?.label) && !ticket?.isDefault;
              return (
                <>
                  <div className="inbox-thread-header__avatar" aria-hidden>
                    {profileUrl ? (
                      <img
                        src={profileUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      inboxDisplayInitials(displayName)
                    )}
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
                    {phone ? (
                      <div className="inbox-thread-header__phone">
                        {typeof formatPhone === 'function' ? formatPhone(phone) : phone}
                      </div>
                    ) : null}
                    {showTicketLine ? (
                      <div className="inbox-thread-header__status-line">{ticket.label}</div>
                    ) : null}
                    <div
                      role="status"
                      className={`inbox-thread-handoff-banner${handoffReleaseHint ? ' inbox-thread-handoff-banner--release' : ''}`}
                      style={
                        handoffReleaseHint
                          ? undefined
                          : { background: banner.bg, color: banner.color, borderLeftColor: 'var(--v500)' }
                      }
                    >
                      {handoffReleaseHint
                        ? 'A IA voltará a responder automaticamente'
                        : banner.text}
                    </div>
                    {!selected?.need_human && aiSuggestHuman ? (
                      <p className="inbox-thread-header__hint">
                        Vale a pena alguém da equipe ver esta conversa
                      </p>
                    ) : null}
                    {!selected?.lead_id && !pendingTriage ? (
                      <div className="inbox-thread-header__unlink">
                        <span className="inbox-thread-header__unlink-badge">Sem contato</span>
                        {editingContactName ? (
                          <>
                            <input
                              id="inbox-contact-name-input"
                              className="input"
                              aria-label="Nome do contato"
                              value={contactNameDraft}
                              onChange={(e) => setContactNameDraft(e.target.value)}
                              placeholder="Nome do contato"
                              autoComplete="name"
                              style={{ minWidth: 170, height: 30, padding: '4px 8px' }}
                            />
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', minHeight: 30 }}
                              onClick={() => void saveContactName()}
                              disabled={savingContactName}
                            >
                              {savingContactName ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', minHeight: 30 }}
                              onClick={() => {
                                setEditingContactName(false);
                                setContactNameDraft('');
                              }}
                              disabled={savingContactName}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', minHeight: 30 }}
                            onClick={() => {
                              const seed =
                                String(selected?.contact_name || '').trim() ||
                                String(selected?.whatsapp_profile_name || '').trim();
                              setContactNameDraft(seed);
                              setEditingContactName(true);
                            }}
                          >
                            {String(selected?.contact_name || '').trim() ? 'Editar nome' : 'Salvar nome'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', minHeight: 30 }}
                          disabled={linkingLead}
                          onClick={() => {
                            setLeadPanel?.('convert');
                            if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                            else setContextOpen?.(true);
                          }}
                        >
                          Converter em contato
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', minHeight: 30 }}
                          disabled={linkingLead}
                          onClick={() => {
                            setLeadPanel?.('associate');
                            if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                            else setContextOpen?.(true);
                          }}
                        >
                          Associar contato
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              );
            })()}
            </div>
        </div>

        <div
          className="inbox-thread-header-actions"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'flex-end',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {String(selected?.ticket_status || '') === 'resolved' ? (
            <button
              className="btn btn-outline"
              style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
              onClick={() => updateTicket({ status: 'open' })}
              disabled={!selectedPhone || ticketUpdating}
              type="button"
              title="Reabre o ticket; use o filtro Em atendimento para acompanhar conversas abertas"
            >
              Reabrir
            </button>
          ) : null}
          {listFilter === 'archived' && selectedPhone ? (
            <button
              className="btn btn-outline"
              style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
              onClick={() => void unarchiveConversation(selectedPhone)}
              disabled={!selectedPhone}
              type="button"
            >
              Desarquivar
            </button>
          ) : null}
          {!selected?.need_human ? (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
              onClick={() => setHandoffActive(true)}
              disabled={!selectedPhone}
              type="button"
              title={`Pausa o agente por ${handoffDurationPhrase}`}
            >
              Assumir
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
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
          <button
            className={`btn btn-outline inbox-thread-header__btn-context${contextOpen && !isMobile && !isNarrowDesktop ? ' is-active' : ''}`}
            style={{ padding: '6px 10px', minHeight: 34, flexShrink: 0 }}
            onClick={() => {
              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
              else setContextOpen((v) => !v);
            }}
            disabled={!selectedPhone}
            title="Abrir painel de detalhes"
            type="button"
          >
            Detalhes
          </button>
          <InboxThreadActionsMenu {...threadActionsMenuProps} />
        </div>
      </div>

      {pendingTriage ? (
        <div className="inbox-thread-triage-banner" data-no-dnd="true">
          <InboxTriageCard
            busy={triageBusy}
            onConfirm={() => onConfirmTriage?.(activeContactLead)}
            onLinkStudent={() => onOpenLinkStudent?.()}
            onDismiss={() => onDismissTriage?.(activeContactLead)}
          />
        </div>
      ) : null}

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
          {threadLoading && <ThreadSkeleton />}
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

      {String(selected?.ticket_status || '').trim().toLowerCase() !== 'resolved' ? (
        <div className="inbox-thread-quick-toolbar" role="toolbar" aria-label="Ações rápidas da conversa">
          <button
            type="button"
            className="inbox-thread-quick-toolbar__btn"
            disabled={!selectedPhone || ticketUpdating}
            onClick={() => void updateTicket({ status: 'resolved' })}
            title="Resolver conversa"
          >
            Resolver
            {showInboxKeyHints ? (
              <span
                aria-hidden
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                E
              </span>
            ) : null}
          </button>
          {!inboxThreadNarrow767 ? (
            <button
              type="button"
              className="inbox-thread-quick-toolbar__btn"
              disabled={!selectedPhone || ticketUpdating}
              onClick={() => void updateTicket({ status: 'waiting_customer' })}
              title="Marcar ticket como aguardando cliente"
            >
              Aguardando cliente
            </button>
          ) : null}
          <button
            type="button"
            className="inbox-thread-quick-toolbar__btn"
            disabled={!selectedPhone}
            onClick={() => {
              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
              else setContextOpen(true);
            }}
            title="Abrir painel de dados do contato"
          >
            Ver ficha
          </button>
        </div>
      ) : null}
      <InboxComposer {...composerProps} />
    </div>
  );
}
