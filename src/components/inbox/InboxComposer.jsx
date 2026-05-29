import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Paperclip, Sparkles, X } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import { applyWhatsappTemplatePlaceholders } from '../../../lib/whatsappTemplateDefaults.js';

function attachmentKindFromFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export default function InboxComposer(props) {
  const {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedPhone && (
              <div style={{ position: 'relative' }}>
                <button
                  className={`inbox-composer-action-btn ${templatesOpen ? 'btn btn-secondary' : 'btn btn-outline'}`}
                  style={{ padding: '0 10px', fontSize: 'var(--inbox-font-list-title)' }}
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
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 36,
                      left: 0,
                      width: 280,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      boxShadow: 'var(--shadow)',
                      padding: 8,
                      zIndex: 50,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                  >
                    <div className="navi-section-heading" style={{ padding: '2px 6px 6px' }}>
                      Mensagens prontas
                    </div>
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
                          className="btn btn-outline"
                          style={{ textAlign: 'left', padding: '6px 10px', minHeight: 32, whiteSpace: 'normal', lineHeight: '18px' }}
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
                          <span
                            style={{
                              display: 'block',
                              fontWeight: 700,
                              fontSize: 'var(--inbox-font-caption)',
                              marginBottom: 2
                            }}
                          >
                            {tpl.label}
                          </span>
                          <span style={{ fontSize: 'var(--inbox-font-secondary)', color: 'var(--text-secondary)' }}>
                            {(tpl.text || '').length > 72 ? `${String(tpl.text).slice(0, 72)}…` : tpl.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-outline inbox-composer-action-btn"
                style={{ padding: '0 10px', fontSize: '1.125rem' }}
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
                <div
                  style={{
                    position: 'absolute',
                    bottom: 36,
                    left: 0,
                    width: 260,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow)',
                    padding: 10,
                    zIndex: 50
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                    {emojis.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="inbox-composer-emoji-grid-btn"
                        onClick={() => {
                          insertAtCursor(em);
                          setEmojiOpen(false);
                        }}
                        style={{
                          padding: 0,
                          borderRadius: 10,
                          background: 'transparent',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <span style={{ fontSize: '1.125rem', lineHeight: 1 }}>{em}</span>
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
                  className="btn btn-outline inbox-composer-action-btn"
                  style={{ padding: '0 10px', minHeight: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            className={scheduleOn ? 'btn btn-secondary' : 'btn btn-outline'}
            style={{ padding: '6px 10px' }}
            onClick={() => setScheduleOn((v) => !v)}
            disabled={sending || !selectedPhone || Boolean(attachment)}
            type="button"
            title={attachment ? 'Remova o anexo para agendar' : undefined}
          >
            Agendar
          </button>
          {scheduleOn && (
            <input
              type="datetime-local"
              className="form-input"
              value={scheduleAtLocal}
              onChange={(e) => setScheduleAtLocal(e.target.value)}
              disabled={sending || !selectedPhone}
              style={{ width: 210 }}
            />
          )}
        </div>
      )}

      {composerExpanded && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34, minWidth: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
              className="btn btn-outline"
              style={{ padding: '6px 10px', minHeight: 34 }}
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
            <div className="text-small" style={{ color: String(draft || '').length > 800 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {String(draft || '').length} chars
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
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
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--inbox-font-secondary)' }}>{tpl.label}</span>
                      <span className="text-small" style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 2 }}>
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
            className="form-input"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 88 }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', flexShrink: 0 }}>
          {draftBeforeImprove != null && !composerExpanded && (
            <button
              className="btn btn-outline"
              style={{ padding: '6px 10px', minHeight: 34, whiteSpace: 'nowrap' }}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="navi-async-btn__spin" aria-hidden />
                Enviar
              </span>
            ) : (
              'Enviar'
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline inbox-composer-action-btn"
            aria-label="Mais opções"
            aria-expanded={composerExpanded}
            onClick={() => setComposerExpanded((v) => !v)}
            title={composerExpanded ? 'Ocultar opções avançadas' : 'Mais opções: templates, emoji, agendar, IA'}
            style={{
              minHeight: 44,
              minWidth: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 10px',
              alignSelf: 'stretch'
            }}
          >
            {composerExpanded ? <ChevronDown size={20} strokeWidth={2} aria-hidden /> : <ChevronUp size={20} strokeWidth={2} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
