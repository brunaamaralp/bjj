export function toIsoFromLocalDatetime(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const [d, t] = s.split('T');
  if (!d || !t) return '';
  const [yy, mm, dd] = d.split('-').map((v) => Number(v));
  const [hh, mi] = t.split(':').map((v) => Number(v));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(hh) || !Number.isFinite(mi)) {
    return '';
  }
  const dt = new Date(yy, mm - 1, dd, hh, mi, 0, 0);
  const ms = dt.getTime();
  if (!Number.isFinite(ms)) return '';
  return dt.toISOString();
}

export function buildOutboundDisplayContent({ caption, text, mediaType }) {
  return (
    caption ||
    text ||
    (mediaType === 'image'
      ? '[imagem]'
      : mediaType === 'audio'
        ? '🎵 [Áudio enviado]'
        : mediaType === 'document'
          ? '📄 [Documento enviado]'
          : '')
  );
}

export function outboundSuccessMessage({ data, status, mediaUrl }) {
  if (String(data?.channel || '').trim() === 'wa_me') {
    return 'Sem instância API: abrimos o WhatsApp para você concluir o envio.';
  }
  if (status === 'scheduled') return 'Agendado';
  if (mediaUrl) return 'Mídia enviada';
  return 'Enviado';
}
