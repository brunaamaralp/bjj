import { useEffect, useState } from 'react';
import { fetchTeamMemberships } from '../lib/teamApi.js';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { getInboxJwt } from '../lib/inboxApiUtils.js';

function scheduleIdleWork(cb, { timeout, fallbackMs }) {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(cb, { timeout });
  }
  return window.setTimeout(cb, fallbackMs);
}

function cancelIdleWork(id) {
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(id);
  } else {
    window.clearTimeout(id);
  }
}

/**
 * Cargas adiadas do Inbox (idle): equipe e flag do agente IA.
 * Mantém o mount inicial focado na lista de conversas.
 */
export function useInboxDeferredBoot(academyId) {
  const [teamMembers, setTeamMembers] = useState([]);
  const [agentIaActive, setAgentIaActive] = useState(false);

  useEffect(() => {
    if (!academyId) return undefined;

    let cancelled = false;
    const loadTeamMembers = () => {
      fetchTeamMemberships(academyId)
        .then((data) => {
          if (cancelled) return;
          const rows = (data.memberships || []).filter(
            (m) => String(m?.userId || '').trim() && String(m?.joined || '').trim()
          );
          setTeamMembers(rows);
        })
        .catch(() => {
          if (!cancelled) setTeamMembers([]);
        });
    };

    const id = scheduleIdleWork(() => {
      if (!cancelled) loadTeamMembers();
    }, { timeout: 3000, fallbackMs: 400 });

    return () => {
      cancelled = true;
      cancelIdleWork(id);
    };
  }, [academyId]);

  useEffect(() => {
    if (!academyId) return undefined;

    let cancelled = false;
    const loadAgentFlag = async () => {
      try {
        const token = await getInboxJwt();
        const { blocked, res } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
          headers: { Authorization: `Bearer ${token}`, 'x-academy-id': academyId },
        });
        if (blocked || !res?.ok) return;
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object') {
          setAgentIaActive(data.ia_ativa === true);
        }
      } catch {
        if (!cancelled) setAgentIaActive(false);
      }
    };

    const id = scheduleIdleWork(() => {
      if (!cancelled) void loadAgentFlag();
    }, { timeout: 2500, fallbackMs: 800 });

    return () => {
      cancelled = true;
      cancelIdleWork(id);
    };
  }, [academyId]);

  return {
    teamMembers: academyId ? teamMembers : [],
    agentIaActive: academyId ? agentIaActive : false,
  };
}
