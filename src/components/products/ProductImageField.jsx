import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import ProductThumb from './ProductThumb.jsx';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  isProductImageUploadConfigured,
  uploadProductImage,
  ProductImageUploadError,
} from '../../lib/uploadProductImage.js';

export default function ProductImageField({ imageUrl, onImageUrlChange, disabled = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState('');

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const previewUrl = localPreview || imageUrl;

  const clearLocalPreview = () => {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview('');
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;

    if (!isProductImageUploadConfigured()) {
      addToast({
        type: 'warning',
        message: 'Upload não configurado — use um link ou defina VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID.',
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });

    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      clearLocalPreview();
      onImageUrlChange(url);
      addToast({ type: 'success', message: 'Imagem enviada.' });
    } catch (err) {
      clearLocalPreview();
      const message =
        err instanceof ProductImageUploadError
          ? err.message
          : friendlyError(err, 'save');
      addToast({ type: 'error', message });
    } finally {
      setUploading(false);
    }
  };

  const onUrlChange = (value) => {
    clearLocalPreview();
    onImageUrlChange(value);
  };

  const onRemove = () => {
    clearLocalPreview();
    onImageUrlChange('');
  };

  return (
    <div className="form-group mt-2">
      <label>Imagem</label>
      <p className="text-xs text-muted product-form-field-hint">JPG, PNG ou WebP — máx. 5 MB</p>
      <div className="product-image-field">
        <div className="product-image-field__preview" aria-hidden={!previewUrl}>
          {previewUrl ? (
            <ProductThumb imageUrl={previewUrl} alt="" size={72} />
          ) : (
            <span className="product-image-field__placeholder">
              <ImagePlus size={28} strokeWidth={1.75} aria-hidden />
            </span>
          )}
        </div>
        <div className="product-image-field__controls">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            hidden
            disabled={disabled || uploading}
            onChange={(event) => void onFile(event)}
          />
          <div className="product-image-field__actions">
            <button
              type="button"
              className="btn-outline product-image-field__upload-btn"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? 'Enviando…' : 'Enviar imagem'}
            </button>
            {imageUrl ? (
              <button
                type="button"
                className="btn-link product-image-field__remove-btn"
                disabled={disabled || uploading}
                onClick={onRemove}
              >
                Remover
              </button>
            ) : null}
          </div>
          <input
            className="form-input product-image-field__url-input"
            type="url"
            placeholder="ou cole um link https://…"
            value={imageUrl}
            disabled={disabled || uploading}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
