const ENDPOINT = String(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1').replace(
  /\/$/,
  ''
);
const PROJECT = String(
  import.meta.env.VITE_APPWRITE_PROJECT || import.meta.env.VITE_APPWRITE_PROJECT_ID || ''
).trim();

/** Normaliza URL de imagem de produto (URL absoluta ou vazio). */
export function resolveProductImageUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${ENDPOINT}${url}`;
  if (PROJECT && /^[a-zA-Z0-9]{10,}$/.test(url)) {
    return `${ENDPOINT}/storage/files/${url}/view?project=${PROJECT}`;
  }
  return url;
}
