/**
 * Conta entradas reais do feed ao vivo (exclui liberação manual e eventos ignorados).
 * @param {Array<{ source?: string, _isManual?: boolean, _isIgnored?: boolean }>|null|undefined} feed
 * @returns {number}
 */
export function countRealFeedEntries(feed) {
  if (!Array.isArray(feed) || feed.length === 0) return 0;
  let n = 0;
  for (const rec of feed) {
    if (!rec) continue;
    const isManual = rec.source === 'manual' || rec._isManual === true;
    const isIgnored = rec.source === 'ignored' || rec._isIgnored === true;
    if (!isManual && !isIgnored) n += 1;
  }
  return n;
}
