import React, { useState } from 'react';
import { X } from 'lucide-react';
import useDialogFocus from '../../hooks/useDialogFocus.js';

function InboxImageLightboxContent({ url, onClose }) {
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useDialogFocus(true, onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
      className="inbox-image-lightbox"
      tabIndex={-1}
      onClick={() => onClose?.()}
    >
      <div className="inbox-image-lightbox__toolbar">
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary inbox-image-lightbox__download"
          onClick={(e) => e.stopPropagation()}
        >
          ⬇ Baixar
        </a>
        <button
          type="button"
          className="btn btn-secondary inbox-image-lightbox__close"
          aria-label="Fechar imagem"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
        >
          <X size={22} aria-hidden />
        </button>
      </div>
      <img
        src={url}
        alt="Imagem ampliada da conversa"
        width={960}
        height={720}
        className={`inbox-image-lightbox__img${zoomed ? ' inbox-image-lightbox__img--zoomed' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
      />
    </div>
  );
}

export default function InboxImageLightbox({ imageUrl, onClose }) {
  const url = String(imageUrl || '').trim();
  if (!url) return null;
  return <InboxImageLightboxContent key={url} url={url} onClose={onClose} />;
}
