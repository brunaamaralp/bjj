/** Citação estilo WhatsApp: cada linha com ">", depois linha em branco para o cursor. */
export function buildQuotedForwardBlock(originalText) {
  const raw = String(originalText ?? '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const quoted = lines.map((ln) => `> ${ln}`).join('\n');
  return `${quoted}\n\n`;
}
