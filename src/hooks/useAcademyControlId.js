import { useEffect, useState } from 'react';
import { fetchControlIdStatus } from '../lib/controlidApi';

const EMPTY_STATUS = {
  enabled: false,
  configured: false,
  connected: false,
  device_ip: '',
  last_sync: '',
  ip: '',
  port: 80,
  username: 'admin',
  portal_id: 1,
};

/**
 * Status Control iD via API server-side (não lê academy.settings no client).
 */
export function useAcademyControlId(academyId) {
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(Boolean(academyId));

  useEffect(() => {
    if (!academyId) {
      setStatus(EMPTY_STATUS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchControlIdStatus(academyId);
        if (cancelled) return;
        setStatus({
          enabled: data.enabled === true,
          configured: data.configured === true,
          connected: data.connected === true,
          device_ip: String(data.device_ip || '').trim(),
          last_sync: String(data.last_sync || '').trim(),
          ip: String(data.device_ip || '').trim(),
          port: Number(data.port) > 0 ? Math.trunc(Number(data.port)) : 80,
          username: String(data.username || 'admin').trim() || 'admin',
          portal_id: Number(data.portal_id) > 0 ? Math.trunc(Number(data.portal_id)) : 1,
        });
      } catch {
        if (!cancelled) setStatus(EMPTY_STATUS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return {
    enabled: status.enabled,
    configured: status.configured,
    connected: status.connected,
    ip: status.ip,
    device_ip: status.device_ip,
    last_sync: status.last_sync,
    port: status.port,
    username: status.username,
    portal_id: status.portal_id,
    loading,
  };
}
