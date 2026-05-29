import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function InboxImageLightbox({ imageUrl, onClose }) {
  const url = String(imageUrl || '').trim();
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setZoomed(false);
  }, [url]);

  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
      className="inbox-image-lightbox"
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
        alt=""
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
