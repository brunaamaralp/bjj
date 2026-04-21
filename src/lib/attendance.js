/**
 * Presenças / check-ins (coleção attendance no Appwrite).
 * Env: VITE_APPWRITE_ATTENDANCE_COL_ID
 */
import { ID, Query } from 'appwrite';
import { databases, DB_ID } from './appwrite';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';

const ATTENDANCE_COL = String(import.meta.env.VITE_APPWRITE_ATTENDANCE_COL_ID || '').trim();

/** Coleção configurada no build (.env). */
export function isAttendanceConfigured() {
    return Boolean(ATTENDANCE_COL);
}

function ymFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * @param {string} leadId
 * @param {string} academyId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getAttendance(leadId, academyId, opts = {}) {
    if (!ATTENDANCE_COL) return [];
    const lid = String(leadId || '').trim();
    const aid = String(academyId || '').trim();
    if (!lid || !aid) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 500);
    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('lead_id', lid),
        Query.equal('academy_id', aid),
        Query.orderDesc('checked_in_at'),
        Query.limit(limit),
    ]);
    return res.documents || [];
}

/**
 * @param {{
 *   lead_id: string;
 *   academy_id: string;
 *   checked_in_by: string;
 *   checked_in_by_name: string;
 * }} data
 * @param {{ teamId?: string; userId?: string }} [permissionContext]
 */
export async function createCheckin(data, permissionContext = {}) {
    if (!ATTENDANCE_COL) {
        throw new Error('Coleção de presença não configurada.');
    }
    const lead_id = String(data.lead_id || '').trim();
    const academy_id = String(data.academy_id || '').trim();
    if (!lead_id || !academy_id) {
        throw new Error('Dados de presença incompletos.');
    }
    const doc = {
        lead_id,
        academy_id,
        checked_in_at: new Date().toISOString(),
        checked_in_by: String(data.checked_in_by || 'user').trim().slice(0, 128),
        checked_in_by_name: String(data.checked_in_by_name || 'Usuário').trim().slice(0, 128) || 'Usuário',
        source: 'manual',
    };
    const perms = buildClientDocumentPermissions({
        teamId: permissionContext.teamId,
        userId: permissionContext.userId,
    });
    return databases.createDocument(DB_ID, ATTENDANCE_COL, ID.unique(), doc, perms);
}

const DIAS_UTEIS_MES_REF = 26;

/**
 * @param {string} leadId
 * @param {string} academyId
 * @returns {Promise<{ thisMonth: number; lastMonth: number; total: number; monthlyRate: string }>}
 */
export async function getAttendanceStats(leadId, academyId) {
    const empty = { thisMonth: 0, lastMonth: 0, total: 0, monthlyRate: '0%' };
    if (!ATTENDANCE_COL) return empty;
    const lid = String(leadId || '').trim();
    const aid = String(academyId || '').trim();
    if (!lid || !aid) return empty;

    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('lead_id', lid),
        Query.equal('academy_id', aid),
        Query.orderDesc('checked_in_at'),
        Query.limit(500),
    ]);
    const docs = res.documents || [];
    const now = new Date();
    const thisYm = ymFromDate(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYm = ymFromDate(prev);

    let thisMonth = 0;
    let lastMonth = 0;
    for (const row of docs) {
        const raw = row.checked_in_at;
        if (!raw) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const rowYm = ymFromDate(d);
        if (rowYm === thisYm) thisMonth += 1;
        if (rowYm === lastYm) lastMonth += 1;
    }
    const total = docs.length;
    const monthlyRate = ((thisMonth / DIAS_UTEIS_MES_REF) * 100).toFixed(0) + '%';
    return { thisMonth, lastMonth, total, monthlyRate };
}
