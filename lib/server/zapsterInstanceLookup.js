/** Helpers compartilhados para achar instância Zapster vinculada a uma academia. */

/** @param {unknown} data */
export function normalizeWaInstancesList(data) {
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.instances)) arr = o.instances;
    else if (Array.isArray(o.data)) arr = o.data;
    else if (o.id) arr = [o];
  }
  return arr
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const r = /** @type {Record<string, unknown>} */ (row);
      const id = String(r.id || r.instance_id || '').trim();
      const meta = r.metadata && typeof r.metadata === 'object' ? /** @type {Record<string, unknown>} */ (r.metadata) : {};
      const academyFromMeta = String(meta.academy_id || meta.academyId || '').trim();
      const name = String(r.name || '').trim();
      const status = String(r.status || '').trim().toLowerCase();
      return { id, metadataAcademyId: academyFromMeta, name, status };
    })
    .filter((x) => x.id);
}

/**
 * @param {Array<{ id: string, metadataAcademyId?: string, name?: string, status?: string }>} items
 * @param {string} academyId
 */
export function findZapsterInstanceForAcademy(items, academyId) {
  const aid = String(academyId || '').trim();
  if (!aid || !Array.isArray(items)) return '';

  const byMeta = items.find((it) => String(it.metadataAcademyId || '').trim() === aid);
  if (byMeta?.id) return String(byMeta.id).trim();

  const prefix = aid.slice(0, 6);
  if (prefix) {
    const byName = items.find((it) => {
      const name = String(it.name || '').trim();
      return name === `CRM-${prefix}` || name.includes(prefix);
    });
    if (byName?.id) return String(byName.id).trim();
  }

  const connected = items.filter((it) => String(it.status || '').trim().toLowerCase() === 'connected');
  if (connected.length === 1) return String(connected[0].id).trim();

  return '';
}
