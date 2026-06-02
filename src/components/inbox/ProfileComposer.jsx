/**
 * @deprecated Use InboxComposer com mode="compact" (ProfileConversationTab).
 * Mantido até validação visual; remover após confirmação.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import AsyncButton from '../shared/AsyncButton.jsx';

const MAX_TEXTAREA_HEIGHT = 120;

export default function ProfileComposer({
  value,
  onChange,
  onSend,
  sending = false,
  disabled = false,
  placeholder = 'Digite uma mensagem...',
}) {
  const textareaRef = useRef(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${Math.max(40, next)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const canSend = Boolean(String(value || '').trim()) && !sending && !disabled;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void onSend?.();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '10px 12px',
        borderTop: '1px solid var(--border-light, var(--border))',
        background: 'var(--surface)',
      }}
    >
      <textarea
        ref={textareaRef}
        className="input"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || sending}
        rows={1}
        style={{
          flex: 1,
          minHeight: 40,
          maxHeight: MAX_TEXTAREA_HEIGHT,
          resize: 'none',
          padding: '10px 12px',
          lineHeight: 1.4,
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      />
      <AsyncButton
        type="button"
        variant="primary"
        loading={sending}
        disabled={!canSend}
        onClick={() => void onSend?.()}
        aria-label="Enviar mensagem"
        style={{
          minWidth: 40,
          minHeight: 40,
          width: 40,
          height: 40,
          padding: 0,
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowUp size={18} aria-hidden />
      </AsyncButton>
    </div>
  );
}
