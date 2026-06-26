import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { friendlyError } from './errorMessages';

/** Limite alinhado ao body JSON da Vercel (~4,5 MB) e ao bucket Appwrite. */
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class ProductImageUploadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ProductImageUploadError';
  }
}

export function isProductImageUploadConfigured() {
  return true;
}

function normalizeMime(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  if (type) return type;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {File} file
 * @returns {Promise<string>} URL pública da imagem no Appwrite Storage
 */
export async function uploadProductImage(file) {
  if (!file) throw new ProductImageUploadError('invalid', 'Arquivo inválido.');
  if (file.size > MAX_BYTES) {
    throw new ProductImageUploadError('too_large', 'Imagem muito grande. Máximo: 4 MB.');
  }

  const mimeType = normalizeMime(file);
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    throw new ProductImageUploadError('unsupported', 'Use JPG, PNG ou WebP.');
  }

  const jwt = await createSessionJwt();
  if (!jwt) {
    throw new ProductImageUploadError('session_required', 'Sessão expirada. Faça login novamente.');
  }

  const academyId = useLeadStore.getState().academyId;
  if (!academyId) {
    throw new ProductImageUploadError('academy_required', 'Academia não selecionada. Recarregue a página.');
  }

  const image_base64 = await fileToDataUrl(file);
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
    },
    body: JSON.stringify({
      action: 'upload_image',
      mime_type: mimeType,
      image_base64,
      filename: file.name || 'produto.jpg',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data.erro || data.error || `error_${res.status}`;
    if (res.status === 404 || /bucket/i.test(String(raw))) {
      throw new ProductImageUploadError(
        'bucket_missing',
        'Armazenamento de imagens não configurado. Peça ao suporte para rodar o provisionamento do bucket.'
      );
    }
    throw new ProductImageUploadError('upload_failed', friendlyError(raw, 'save'));
  }

  const url = String(data.image_url || '').trim();
  if (!url) {
    throw new ProductImageUploadError('upload_failed', 'Não foi possível obter o link da imagem.');
  }
  return url;
}
