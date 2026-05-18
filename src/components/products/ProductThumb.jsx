import React, { useState } from 'react';
import { Package } from 'lucide-react';

export default function ProductThumb({ imageUrl, alt, size = 48 }) {
  const [broken, setBroken] = useState(false);
  const url = String(imageUrl || '').trim();

  if (!url || broken) {
    return (
      <span
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: 'var(--surface-2, rgba(0,0,0,0.06))',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
        aria-hidden={!alt}
      >
        <Package size={Math.round(size * 0.45)} strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={alt || ''}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
      onError={() => setBroken(true)}
    />
  );
}
