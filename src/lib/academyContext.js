/** Snapshot de sessão da academia — evita useStudentStore importar useLeadStore (TDZ no bundle). */

let ctx = {
  academyId: null,
  academyList: [],
  teamId: null,
  userId: null,
};

export function syncAcademyContext(state) {
  ctx = {
    academyId: state?.academyId ?? null,
    academyList: Array.isArray(state?.academyList) ? state.academyList : [],
    teamId: state?.teamId ?? null,
    userId: state?.userId ?? null,
  };
}

export function getAcademyContext() {
  return ctx;
}

export function permissionContextFromAcademy(academyIdOverride) {
  const { academyId, academyList, teamId, userId } = ctx;
  const aid = academyIdOverride ?? academyId;
  const acadDoc = academyList.find((a) => a.id === aid) || {};
  return {
    ownerId: acadDoc.ownerId || '',
    teamId: acadDoc.teamId || teamId || '',
    userId: userId || '',
  };
}
