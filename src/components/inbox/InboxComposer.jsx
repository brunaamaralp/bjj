import React, { useEffect, useRef, useState } from 'react';
import { Bold, ChevronDown, ChevronUp, Italic, Loader2, Paperclip, Smile, Sparkles, X } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import { DateInputField } from '../DateInput';
import { applyWhatsappTemplatePlaceholders } from '../../../lib/whatsappTemplateDefaults.js';

function attachmentKindFromFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export default function InboxComposer(props) {
  const {
    mode = 'full',
    compactDisabled = false,
    compactPlaceholder = 'Digite uma mensagem...',
    isMobile,
    inboxVvInset,
    composerExpanded,
    selectedPhone,
    selected,
    templatesOpen,
    setTemplatesOpen,
    setEmojiOpen,
    quickTemplates,
    terms,
    leads,
    academyNameForTemplates,
    setDraft,
    textareaRef,
    emojiOpen,
    emojis,
    insertAtCursor,
    scheduleOn,
    setScheduleOn,
    sending,
    scheduleAtLocal,
    setScheduleAtLocal,
    improveDraftWithAi,
    improvingDraft,
    draft,
    draftBeforeImprove,
    setDraftBeforeImprove,
    slashOpen,
    slashPopupRef,
    inboxSlashMaxHeight,
    slashFilteredTemplates,
    slashIndex,
    setSlashIndex,
    slashActiveItemRef,
    applySlashTemplate,
    handleDraftChange,
    applyWrapToDraft,
    sendManual,
    setComposerExpanded,
    setSlashOpen,
    setSlashQuery,
    toast
  } = props;

  const fileInputRef = useRef(null);
  const [attachment, setAttachment] = useState(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [audioDuration, setAudioDuration] = useState('');

  function clearAttachment() {
    setAttachment((prev) => {
      if (prev?.previewUrl) {
        try {
          URL.revokeObjectURL(prev.previewUrl);
        } catch {
          void 0;
        }
      }
      return null;
    });
    setMediaCaption('');
    setAudioDuration('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  useEffect(() => () => {
    if (attachment?.previewUrl) {
      try {
        URL.revokeObjectURL(attachment.previewUrl);
      } catch {
        void 0;
      }
    }
  }, [attachment?.previewUrl]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = attachmentKindFromFile(file);
    let previewUrl = '';
    if (kind === 'image') previewUrl = URL.createObjectURL(file);
    setAttachment((prev) => {
      if (prev?.previewUrl) {
        try {
          URL.revokeObjectURL(prev.previewUrl);
        } catch {
          void 0;
        }
      }
      return { file, previewUrl, kind, name: file.name };
    });
    setMediaCaption('');
    setAudioDuration('');
    if (kind === 'audio') {
      try {
        const probe = document.createElement('audio');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          const d = probe.duration;
          if (Number.isFinite(d) && d > 0) {
            const m = Math.floor(d / 60);
            const s = Math.floor(d % 60);
            setAudioDuration(`${m}:${String(s).padStart(2, '0')}`);
          }
          try {
            URL.revokeObjectURL(probe.src);
          } catch {
            void 0;
          }
        };
        probe.src = URL.createObjectURL(file);
      } catch {
        void 0;
      }
    }
    setComposerExpanded(true);
  }

  async function handleComposerSend() {
    if (attachment?.file) {
      if (scheduleOn) {
        toast?.show?.({ type: 'error', message: 'Agendamento não está disponível para envio de mídia.' });
        return;
      }
      try {
        await sendManual({
          file: attachment.file,
          caption: mediaCaption || draft
        });
        clearAttachment();
      } catch {
        void 0;
      }
      return;
    }
    sendManual();
  }

  const canSend = Boolean(selectedPhone) && (String(draft || '').trim() || attachment?.file);
  const showImageCaption = attachment?.kind === 'image';
  const isCompact = mode === 'compact';

  if (isCompact) {
    const canSendCompact = !compactDisabled && !sending && Boolean(String(draft || '').trim());
    return (
      <div
        className={`inbox-thread-composer inbox-thread-composer--compact${isMobile ? ' inbox-thread-composer--mobile-safe' : ''}`}
        style={{ '--inbox-vv-inset': `${inboxVvInset}px` }}
      >
        <div className="inbox-composer-compact-row">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSendCompact) void sendManual?.();
              }
            }}
            placeholder={compactPlaceholder}
            className="form-input inbox-composer-compact-input"
            rows={1}
            disabled={compactDisabled || sending}
          />
          <button
            className="btn btn-primary inbox-composer-compact-send"
            onClick={() => void sendManual?.()}
            disabled={sending || !canSendCompact}
            type="button"
          >
            {sending ? (
              <span className="inbox-composer-send-loading">
                <Loader2 size={16} className="navi-async-btn__spin" aria-hidden />
                Enviar
              </span>
            ) : (
              'Enviar'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inbox-thread-composer${isMobile ? ' inbox-thread-composer--mobile-safe' : ''}`}
      style={{ '--inbox-vv-inset': `${inboxVvInset}px` }}
    >
      {attachment ? (
        <div className="inbox-composer-attachment-preview">
          <div className="inbox-composer-attachment-preview__main">
            {attachment.kind === 'image' && attachment.previewUrl ? (
              <img
                src={attachment.previewUrl}
                alt=""
                className="inbox-composer-attachment-preview__thumb"
              />
            ) : (
              <div className="inbox-composer-attachment-preview__icon" aria-hidden>
                {attachment.kind === 'audio' ? '🎵' : '📄'}
              </div>
            )}
            <div className="inbox-composer-attachment-preview__meta">
              <div className="inbox-composer-attachment-preview__name">{attachment.name}</div>
              {attachment.kind === 'audio' && audioDuration ? (
                <div className="inbox-composer-attachment-preview__sub">{audioDuration}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-outline inbox-composer-attachment-preview__remove"
              aria-label="Remover anexo"
              onClick={clearAttachment}
              disabled={sending}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {showImageCaption ? (
            <label className="inbox-composer-attachment-preview__caption">
              <span className="inbox-composer-attachment-preview__caption-label">Caption:</span>
              <input
                type="text"
                className="form-input"
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                placeholder="Legenda opcional"
                disabled={sending}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {composerExpanded && (
        <div className="inbox-composer-toolbar-row">
          <div className="inbox-composer-toolbar-group">
            {selectedPhone && (
              <div className="inbox-composer-popover-anchor">
                <button
                  className={`inbox-composer-action-btn ${templatesOpen ? 'btn btn-secondary' : 'btn btn-outline'}`}
                  onClick={() => {
                    setTemplatesOpen((v) => !v);
                    setEmojiOpen(false);
                  }}
                  type="button"
                  title="Mensagens prontas"
                >
                  {'\u26A1'}
                </button>
                {templatesOpen && (
                  <div className="inbox-composer-popover inbox-composer-popover--templates">
                    <div className="navi-section-heading inbox-composer-popover__heading">Mensagens prontas</div>
                    {quickTemplates.length === 0 && (
                      <EmptyState
                        variant="bare"
                        title={`Nenhum template da ${terms.workspaceNoun}.`}
                        description="Configure em Automações no menu."
                        role="status"
                        className="inbox-quick-templates-empty"
                      />
                    )}
                    {quickTemplates.map((tpl) => {
                      const lid = String(selected?.lead_id || '').trim();
                      const fromStore = lid ? leads.find((x) => String(x.id) === lid) : null;
                      const leadForTpl = fromStore || { name: selected?.lead_name, lead_name: selected?.lead_name };
                      return (
                        <button
                          key={tpl.key}
                          type="button"
                          className="btn btn-outline inbox-composer-template-btn"
                          onClick={() => {
                            const out = applyWhatsappTemplatePlaceholders(tpl.text, {
                              lead: leadForTpl,
                              academyName: academyNameForTemplates
                            });
                            setDraft(out);
                            setTemplatesOpen(false);
                            try {
                              textareaRef.current?.focus();
                            } catch {
                              void 0;
                            }
                          }}
                        >
                          <span className="inbox-composer-template-btn__label">{tpl.label}</span>
                          <span className="inbox-composer-template-btn__preview">
                            {(tpl.text || '').length > 72 ? `${String(tpl.text).slice(0, 72)}…` : tpl.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="inbox-composer-popover-anchor">
              <button
                className="btn btn-outline inbox-composer-action-btn inbox-composer-action-btn--emoji"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  setTemplatesOpen(false);
                }}
                type="button"
                aria-expanded={emojiOpen}
                title="Inserir emoji"
              >
                {'\u{1F60A}'}
              </button>
              {emojiOpen && (
                <div className="inbox-composer-popover inbox-composer-popover--emoji">
                  <div className="inbox-composer-emoji-grid">
                    {emojis.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="inbox-composer-emoji-grid-btn"
                        onClick={() => {
                          insertAtCursor(em);
                          setEmojiOpen(false);
                        }}
                      >
                        <span>{em}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedPhone ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*,application/pdf"
                  hidden
                  onChange={handleFileChange}
                />
                <button
                  className="btn btn-outline inbox-composer-action-btn inbox-composer-action-btn--attach"
                  type="button"
                  title="Anexar imagem, áudio ou PDF"
                  aria-label="Anexar arquivo"
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={16} strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {(composerExpanded || scheduleOn) && (
        <div className="inbox-composer-schedule-row">
          <button
            className={`${scheduleOn ? 'btn btn-secondary' : 'btn btn-outline'} inbox-composer-btn--schedule`}
            onClick={() => setScheduleOn((v) => !v)}
            disabled={sending || !selectedPhone || Boolean(attachment)}
            type="button"
            title={attachment ? 'Remova o anexo para agendar' : undefined}
          >
            Agendar
          </button>
          {scheduleOn && (
            <DateInputField
              type="datetime-local"
              className="form-input inbox-composer-schedule-input"
              value={scheduleAtLocal}
              onChange={(e) => setScheduleAtLocal(e.target.value)}
              disabled={sending || !selectedPhone}
            />
          )}
        </div>
      )}

      {composerExpanded && (
        <div className="inbox-composer-ai-row">
          <button
            className="btn btn-outline inbox-composer-btn--tool"
            onClick={improveDraftWithAi}
            disabled={sending || improvingDraft || !selectedPhone || String(draft || '').trim().length <= 3}
            type="button"
            title={improvingDraft ? 'Melhorando…' : 'Melhorar texto com IA (usa o contexto da conversa)'}
            aria-label={improvingDraft ? 'Melhorando texto com IA' : 'Melhorar texto com IA'}
            aria-busy={improvingDraft}
          >
            {improvingDraft ? (
              <Loader2 size={18} className="inbox-improve-spin" aria-hidden />
            ) : (
              <Sparkles size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
          {draftBeforeImprove != null && (
            <button
              className="btn btn-outline inbox-composer-btn--undo"
              onClick={() => {
                setDraft(String(draftBeforeImprove));
                setDraftBeforeImprove(null);
                try {
                  setTimeout(() => textareaRef.current?.focus?.(), 0);
                } catch {
                  void 0;
                }
              }}
              disabled={sending || improvingDraft}
              type="button"
              title="Voltar ao texto antes da melhoria"
            >
              {'\u21A9'} Desfazer
            </button>
          )}
          {String(draft || '').length > 160 && (
            <div
              className={`text-small ${
                String(draft || '').length > 800
                  ? 'inbox-composer-char-count--warn'
                  : 'inbox-composer-char-count--ok'
              }`}
            >
              {String(draft || '').length} chars
            </div>
          )}
        </div>
      )}

      <div className="inbox-composer-main-row">
        <div className="inbox-composer-input-wrap">
          {selectedPhone && (
            <div className="inbox-composer-format-toolbar">
              <button
                type="button"
                className="btn btn-outline inbox-composer-format-btn"
                onClick={() => applyWrapToDraft('*')}
                title="Negrito (*)"
              >
                <Bold size={13} strokeWidth={2.5} aria-hidden />
                <span className="text-small font-medium inbox-composer-format-btn__label--hide-mobile">Negrito</span>
              </button>
              <button
                type="button"
                className="btn btn-outline inbox-composer-format-btn"
                onClick={() => applyWrapToDraft('_')}
                title="Itálico (_)"
              >
                <Italic size={13} strokeWidth={2.5} aria-hidden />
                <span className="text-small font-medium inbox-composer-format-btn__label--hide-mobile">Itálico</span>
              </button>

              <div className="inbox-composer-popover-anchor">
                <button
                  type="button"
                  className={`btn inbox-composer-format-btn ${emojiOpen ? 'btn-secondary' : 'btn-outline'}`}
                  onClick={() => {
                    setEmojiOpen((v) => !v);
                    setTemplatesOpen(false);
                  }}
                  aria-expanded={emojiOpen}
                  title="Emoji"
                >
                  <Smile size={13} strokeWidth={2.5} aria-hidden />
                  <span className="text-small font-medium inbox-composer-format-btn__label--hide-mobile">Emoji</span>
                </button>
                {emojiOpen && (
                  <div className="inbox-composer-popover inbox-composer-emoji-popover--toolbar">
                    <div className="inbox-composer-emoji-grid">
                      {emojis.map((em) => (
                        <button
                          key={em}
                          type="button"
                          className="inbox-composer-emoji-grid-btn"
                          onClick={() => {
                            insertAtCursor(em);
                            setEmojiOpen(false);
                          }}
                        >
                          <span>{em}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {slashOpen && selectedPhone && (
            <div ref={slashPopupRef} className="inbox-slash-templates" style={{ maxHeight: inboxSlashMaxHeight }} role="listbox" aria-label="Templates rápidos">
              {slashFilteredTemplates.length === 0 ? (
                <EmptyState variant="bare" title="Nenhum template encontrado" role="status" className="inbox-slash-empty" />
              ) : (
                slashFilteredTemplates.map((tpl, idx) => {
                  const rawPrev = String(tpl.text || '').replace(/\s+/g, ' ').trim();
                  const preview = rawPrev.length > 60 ? `${rawPrev.slice(0, 60)}…` : rawPrev;
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      role="option"
                      aria-selected={idx === slashIndex}
                      ref={idx === slashIndex ? slashActiveItemRef : undefined}
                      className={`inbox-slash-templates-row${idx === slashIndex ? ' active' : ''}`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applySlashTemplate(tpl);
                      }}
                    >
                      <span className="inbox-composer-template-btn__label">{tpl.label}</span>
                      <span className="inbox-composer-template-btn__preview inbox-composer-template-btn__preview--slash">
                        {preview}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(e) => {
              if (slashOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashIndex((i) => {
                    const n = slashFilteredTemplates.length;
                    if (n <= 0) return 0;
                    return Math.min(i + 1, n - 1);
                  });
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashIndex((i) => Math.max(0, i - 1));
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashOpen(false);
                  setSlashQuery('');
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (slashFilteredTemplates.length > 0) {
                    const n = slashFilteredTemplates.length;
                    const idx = Math.min(Math.max(0, slashIndex), n - 1);
                    applySlashTemplate(slashFilteredTemplates[idx]);
                  } else {
                    setSlashOpen(false);
                    setSlashQuery('');
                  }
                  return;
                }
              }
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === 'b') {
                  e.preventDefault();
                  applyWrapToDraft('*');
                  return;
                }
                if (k === 'i') {
                  e.preventDefault();
                  applyWrapToDraft('_');
                  return;
                }
                if (k === 'enter') {
                  e.preventDefault();
                  handleComposerSend();
                  return;
                }
              }
              if (e.key === 'Escape') setEmojiOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComposerSend();
              }
            }}
            placeholder={selected?.need_human ? 'Responder manualmente…' : 'Agente IA ativo — responda para assumir o atendimento'}
            className="form-input inbox-composer-textarea"
            rows={3}
            onFocus={(e) => {
              if (!isMobile) setComposerExpanded(true);
              if (isMobile) {
                const el = e.currentTarget;
                setTimeout(() => {
                  try {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  } catch {
                    void 0;
                  }
                }, 100);
              }
            }}
          />
        </div>
        <div className="inbox-composer-side-col">
          {draftBeforeImprove != null && !composerExpanded && (
            <button
              className="btn btn-outline inbox-composer-btn--undo"
              onClick={() => {
                setDraft(String(draftBeforeImprove));
                setDraftBeforeImprove(null);
                try {
                  setTimeout(() => textareaRef.current?.focus?.(), 0);
                } catch {
                  void 0;
                }
              }}
              disabled={sending || improvingDraft}
              type="button"
              title="Voltar ao texto antes da melhoria"
            >
              {'\u21A9'} Desfazer
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleComposerSend}
            disabled={sending || !canSend}
            type="button"
          >
            {sending ? (
              <span className="inbox-composer-send-loading">
                <Loader2 size={16} className="navi-async-btn__spin" aria-hidden />
                Enviar
              </span>
            ) : (
              'Enviar'
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline inbox-composer-action-btn inbox-composer-expand-btn"
            aria-label="Mais opções"
            aria-expanded={composerExpanded}
            onClick={() => setComposerExpanded((v) => !v)}
            title={composerExpanded ? 'Ocultar opções avançadas' : 'Mais opções: templates, emoji, agendar, IA'}
          >
            {composerExpanded ? <ChevronDown size={20} strokeWidth={2} aria-hidden /> : <ChevronUp size={20} strokeWidth={2} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
