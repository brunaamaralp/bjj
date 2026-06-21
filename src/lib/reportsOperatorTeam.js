export function normalizeReportsOperatorTeam(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.memberships)
      ? payload.memberships
      : Array.isArray(payload?.members)
        ? payload.members
        : [];

  return list
    .map((member) => {
      const id = String(member?.id || member?.userId || member?.user_id || '').trim();
      if (!id) return null;
      const nome =
        String(member?.nome || member?.name || member?.userName || member?.userEmail || member?.email || id).trim()
        || id;
      return { id, nome };
    })
    .filter(Boolean);
}
