import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import ThreadState from './ThreadState';
import ThreadSkeleton from './ThreadSkeleton';
import InboxComposer from './InboxComposer';
import { getThreadHandoffBanner, getThreadHandoffPill } from '../../../lib/inboxHandoffPresentation.js';

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
    menu,
    openMenu,
    closeMenu,
    threadScrollRef,
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
    composerProps,
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
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 auto' }}>
            <div className="inbox-thread-header__title">
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const name = pickDisplayName({
                  leadName: String(lead?.name || '').trim() || String(selected?.lead_name || '').trim(),
                  manualContactName: selected?.contact_name,
                  whatsappProfileName: selected?.whatsapp_profile_name,
                  phone
                });
                return name || phone || '—';
              })()}
            </div>
            {(() => {
              const pill = getThreadHandoffPill({
                needHuman: Boolean(selected?.need_human),
                humanHandoffUntil: selected?.human_handoff_until,
                nowMs,
              });
              const banner = getThreadHandoffBanner({
                needHuman: Boolean(selected?.need_human),
                humanHandoffUntil: selected?.human_handoff_until,
                nowMs,
              });
              return (
                <>
                  <span
                    role="status"
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: 999,
                      background: pill.bg,
                      color: pill.color,
                      border: pill.border,
                    }}
                  >
                    {pill.label}
                  </span>
                  <div
                    role="status"
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      fontSize: 'var(--inbox-font-secondary)',
                      lineHeight: 1.35,
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 8,
                      background: handoffReleaseHint ? 'var(--v50, #EEEDFE)' : banner.bg,
                      color: handoffReleaseHint ? 'var(--v700, #534AB7)' : banner.color,
                    }}
                  >
                    {handoffReleaseHint
                      ? 'A IA voltará a responder automaticamente'
                      : banner.text}
                  </div>
                </>
              );
            })()}
            {!selected?.lead_id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span
                  className="text-small"
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--v50, #EEEDFE)',
                    color: 'var(--v700, #534AB7)',
                  }}
                >
                  Sem contato
                </span>
                {editingContactName ? (
                  <>
                    <input
                      className="input"
                      value={contactNameDraft}
                      onChange={(e) => setContactNameDraft(e.target.value)}
                      placeholder="Nome do contato"
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
                      const seed = String(selected?.contact_name || '').trim() || String(selected?.whatsapp_profile_name || '').trim();
                      setContactNameDraft(seed);
                      setEditingContactName(true);
                    }}
                  >
                    {String(selected?.contact_name || '').trim() ? 'Editar nome' : 'Salvar nome'}
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const name = pickDisplayName({
                  leadName: String(lead?.name || '').trim() || String(selected?.lead_name || '').trim(),
                  manualContactName: selected?.contact_name,
                  whatsappProfileName: selected?.whatsapp_profile_name,
                  phone
                });
                const showPhone = Boolean(name) && Boolean(phone);
                if (!showPhone) return null;
                return (
                  <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                    {phone}
                  </span>
                );
              })()}
              {(() => {
                const chip = ticketChip(selected?.ticket_status, selected?.transfer_to);
                return (
                  <span className="text-small" style={{ background: chip.bg, color: chip.fg, padding: '2px 8px', borderRadius: 999 }} title="Status do ticket">
                    {chip.label}
                  </span>
                );
              })()}
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const aiSuggestHuman = Boolean(lead?.needHuman);
                if (selected?.need_human || !aiSuggestHuman) return null;
                return (
                  <span
                    className="text-small"
                    style={{
                      background: 'var(--warning-light)',
                      color: 'var(--warning-text)',
                      padding: '4px 10px',
                      borderRadius: 999,
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}
                    title={`Sugestão com base no ${contactLabel.toLowerCase()}`}
                  >
                    Vale a pena alguém da equipe ver esta conversa
                  </span>
                );
              })()}
            </div>
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
            className="btn btn-outline"
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
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34, fontWeight: 900, flexShrink: 0 }}
            onClick={(e) => openMenu('thread', e.currentTarget, { phone: String(selectedPhone || '').trim() })}
            disabled={!selectedPhone}
            title={!selectedPhone ? 'Selecione uma conversa para ver as ações' : 'Mais ações'}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'thread'}
          >
            {'\u22EF'}
          </button>
        </div>
      </div>

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

          {Array.isArray(threadBlocks) && threadBlocks.map((b) => {
            if (b.type === 'day') {
              return (
                <div key={b.key} className="inbox-day-divider">
                  <span className="text-small inbox-day-divider__pill">
                    {b.label}
                  </span>
                </div>
              );
            }
            const g = b;
            return (
              <div
                key={g.id}
                className={`inbox-msg-row ${g.alignEnd ? 'inbox-msg-row--end' : 'inbox-msg-row--start'}`}
              >
                <div
                  className={`inbox-bubble inbox-bubble--${g.bubbleKind || 'user'}`}
                >
                  {g.items.map(({ key, m }, idx) => {
                    const contentRaw = String(m?.content || '');
                    const mediaUrlNorm = inboxMessageMediaUrl(m);
                    const typeLower = String(m?.type || '').toLowerCase();
                    const audioPlaceholder = inboxContentIsAudioPlaceholder(contentRaw);
                    const showAudioPlayer =
                      Boolean(mediaUrlNorm) &&
                      (typeLower === 'audio' || typeLower === 'ptt' || audioPlaceholder);
                    const showImage = typeLower === 'image' && Boolean(mediaUrlNorm);
                    const expanded = Boolean(expandedMsgs && typeof expandedMsgs === 'object' && expandedMsgs[key]);
                    const content = !expanded && contentRaw.length > 600 ? `${contentRaw.slice(0, 600)}…` : contentRaw;
                    const statusLower = String(m?.status || '').trim().toLowerCase();
                    const scheduledAt = typeof m?.send_at === 'string' ? String(m.send_at) : '';
                    const canceledAt = typeof m?.canceled_at === 'string' ? String(m.canceled_at) : '';
                    const isScheduled = statusLower === 'scheduled' && !!scheduledAt;
                    const isCanceled = statusLower === 'canceled';
                    const mine = m?.role === 'assistant';
                    const mid = String(m?.message_id || '').trim();
                    const canCancel = mine && (statusLower === 'scheduled' || statusLower === 'pending') && !!mid;
                    const isSelected = String(selectedMsgKey || '') === key;
                    const pinned = Boolean(selectedPhoneFlags?.pinned && selectedPhoneFlags.pinned[key]);
                    const important = Boolean(selectedPhoneFlags?.important && selectedPhoneFlags.important[key]);
                    const senderKind = senderKindFromMessage(m);
                    const senderLabel = senderKind === 'ai' ? 'Agente IA' : senderKind === 'human' ? 'Humano' : 'Cliente';
                    return (
                      <div
                        key={`${key}-${idx}`}
                        data-msgkey={key}
                        className={isSelected ? 'inbox-msg selected' : 'inbox-msg'}
                        style={{ position: 'relative', paddingTop: idx === 0 ? 0 : 10 }}
                        onClick={() => setSelectedMsgKey((v) => (String(v || '') === key ? '' : key))}
                      >
                        {idx === 0 && g.bubbleKind !== 'user' && (
                          <div
                            className={`inbox-msg-sender-label ${
                              g.bubbleKind === 'ai' ? 'inbox-msg-sender-label--ai' : 'inbox-msg-sender-label--human'
                            }`}
                          >
                            {g.bubbleKind === 'ai' ? (
                              <>
                                <Sparkles size={12} aria-hidden /> Agente IA
                              </>
                            ) : (
                              'Você'
                            )}
                          </div>
                        )}
                        {showAudioPlayer ? (
                          <div className="inbox-msg-audio" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <audio
                              controls
                              src={mediaUrlNorm}
                              preload="metadata"
                              style={{ width: '100%', maxWidth: 320, minWidth: 200, verticalAlign: 'middle' }}
                            />
                            <p className="text-small" style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
                              Se não reproduzir, o link pode ter expirado — abra no WhatsApp.
                            </p>
                            {String(content || '').trim() &&
                            !String(content || '')
                              .trim()
                              .startsWith('🎵') ? (
                              <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginTop: 8 }}>
                                {content}
                              </div>
                            ) : null}
                          </div>
                        ) : audioPlaceholder && !mediaUrlNorm ? (
                          <div className="inbox-msg-text" style={{ color: 'var(--text-secondary)' }}>
                            <span aria-hidden>🎵</span> Áudio recebido — link não disponível no painel. Use <strong>Sincronizar WhatsApp</strong> ou abra no app do WhatsApp.
                          </div>
                        ) : showImage ? (
                          <div className="inbox-msg-image">
                            <img
                              src={mediaUrlNorm}
                              alt="Imagem"
                              loading="lazy"
                              decoding="async"
                              style={{
                                maxWidth: '100%',
                                maxHeight: 300,
                                borderRadius: 8,
                                cursor: 'pointer',
                                objectFit: 'cover',
                                display: 'block'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setImageLightboxUrl(mediaUrlNorm);
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                const el = e.target.nextSibling;
                                if (el && el.style) el.style.display = 'flex';
                              }}
                            />
                            <div
                              style={{
                                display: 'none',
                                alignItems: 'center',
                                gap: 8,
                                color: 'var(--text-muted)',
                                fontSize: 'var(--inbox-font-secondary)',
                                padding: '8px 0'
                              }}
                            >
                              Imagem indisponível (link expirado ou bloqueado)
                            </div>
                            {String(content || '').trim() && String(content || '').trim() !== '[imagem]' ? (
                              <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginTop: 8 }}>
                                {content}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                            {content}
                          </div>
                        )}
                        {!expanded && contentRaw.length > 600 && (
                          <button
                            className="btn btn-outline"
                            style={{ minHeight: 28, padding: '0 10px', marginTop: 8 }}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedMsgs((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [key]: true }));
                            }}
                          >
                            Ver mais
                          </button>
                        )}
                        <div className="inbox-msg-meta" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                            {formatTimeOnly(m?.timestamp) || formatWhen(m?.timestamp)}
                            {pinned ? ' • Fixada' : ''}
                            {important ? ' • Importante' : ''}
                          </span>
                          <div className="inbox-msg-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px' }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const base = contentRaw.replace(/\s+/g, ' ').trim();
                                const snippet = base.length > 120 ? `${base.slice(0, 120)}…` : base;
                                if (snippet) {
                                  setDraft((prev) => {
                                    const p = String(prev || '');
                                    const prefix = p.trim() ? `${p}\n\n` : '';
                                    return `${prefix}Respondendo: "${snippet}"\n\n`;
                                  });
                                  try {
                                    textareaRef.current && textareaRef.current.focus && textareaRef.current.focus();
                                  } catch {
                                    void 0;
                                  }
                                }
                              }}
                            >
                              Responder
                            </button>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px' }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                copyToClipboard(contentRaw);
                              }}
                            >
                              Copiar
                            </button>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px', fontWeight: 900 }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openMenu('message', e.currentTarget, { key, phone: String(selectedPhoneRef.current || '').trim(), m, canCancel });
                              }}
                              aria-haspopup="menu"
                              aria-expanded={menu?.kind === 'message' && menu?.payload?.key === key}
                            >
                              {'\u22EF'}
                            </button>
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                              {senderLabel}
                            </span>
                            {!!String(statusLower || '').trim() && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Status: {statusLower}
                              </span>
                            )}
                            {isScheduled && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Agendada: {formatWhen(scheduledAt)}
                              </span>
                            )}
                            {isCanceled && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Cancelada: {canceledAt ? formatWhen(canceledAt) : '—'}
                              </span>
                            )}
                            {canCancel && (
                              <button
                                className="btn btn-outline"
                                style={{ minHeight: 28, padding: '0 10px' }}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  cancelScheduledMessage(mid);
                                }}
                                disabled={Boolean(cancelingMsgId) || cancelingMsgId === mid}
                              >
                                {cancelingMsgId === mid ? 'Cancelando…' : 'Cancelar agendamento'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {threadMessagesEmptyUi && waChatConnected && (
            <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
              <EmptyState
                variant="embedded"
                tone="dashed"
                icon={MessageSquare}
                title="Nenhuma mensagem carregada"
                description='Se já há mensagens no WhatsApp, clique em "Sincronizar" para importar as últimas 24h (limite do plano Zapster).'
                role="status"
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
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
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', minHeight: 34, pointerEvents: 'auto' }}
              type="button"
              onClick={() => scrollThreadToBottom({ clearNew: true })}
              title="Ir para o mais recente"
            >
              {newMsgCount} novas • Ir para o mais recente
            </button>
          </div>
        )}
      </div>

      {String(selected?.ticket_status || '').trim().toLowerCase() !== 'resolved' ? (
        <div
          role="toolbar"
          aria-label="Ações rápidas da conversa"
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
            padding: '6px 10px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            minHeight: 38,
            boxSizing: 'border-box',
            background: 'var(--surface)'
          }}
        >
          <button
            type="button"
            disabled={!selectedPhone || ticketUpdating}
            onClick={() => void updateTicket({ status: 'resolved' })}
            title="Resolver conversa"
            style={{
              height: 28,
              padding: '0 10px',
              fontSize: 12,
              lineHeight: '26px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: !selectedPhone || ticketUpdating ? 'not-allowed' : 'pointer',
              opacity: !selectedPhone || ticketUpdating ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxSizing: 'border-box',
              fontFamily: 'var(--ff-ui, inherit)'
            }}
          >
            Resolver
            {showInboxKeyHints ? (
              <span
                aria-hidden
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                E
              </span>
            ) : null}
          </button>
          {!inboxThreadNarrow767 ? (
            <button
              type="button"
              disabled={!selectedPhone || ticketUpdating}
              onClick={() => void updateTicket({ status: 'waiting_customer' })}
              title="Marcar ticket como aguardando cliente"
              style={{
                height: 28,
                padding: '0 10px',
                fontSize: 12,
                lineHeight: '26px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text)',
                fontWeight: 600,
                cursor: !selectedPhone || ticketUpdating ? 'not-allowed' : 'pointer',
                opacity: !selectedPhone || ticketUpdating ? 0.5 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                boxSizing: 'border-box',
                fontFamily: 'var(--ff-ui, inherit)'
              }}
            >
              Aguardando cliente
            </button>
          ) : null}
          <button
            type="button"
            disabled={!selectedPhone}
            onClick={() => {
              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
              else setContextOpen(true);
            }}
            title="Abrir painel de dados do contato"
            style={{
              height: 28,
              padding: '0 10px',
              fontSize: 12,
              lineHeight: '26px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: !selectedPhone ? 'not-allowed' : 'pointer',
              opacity: !selectedPhone ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              fontFamily: 'var(--ff-ui, inherit)'
            }}
          >
            Ver ficha
          </button>
        </div>
      ) : null}
      <InboxComposer {...composerProps} />
    </div>
  );
}
