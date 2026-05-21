import React, { useState } from 'react';
import { Package } from 'lucide-react';

export default function ProductThumb({ imageUrl, alt, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const url = String(imageUrl || '').trim();
  const iconSize = size <= 32 ? 14 : size <= 40 ? 16 : Math.round(size * 0.45);

  if (!url || broken) {
    return (
      <span
        className="product-thumb product-thumb--placeholder"
        style={{ width: size, height: size }}
        aria-hidden={!alt}
      >
        <Package size={iconSize} strokeWidth={1.75} aria-hidden />
      </span>
    );
  }

  return (
    <img
      className="product-thumb product-thumb--image"
      src={url}
      alt={alt || ''}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setBroken(true)}
    />
  );
}
