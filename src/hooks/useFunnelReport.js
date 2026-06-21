import { useCallback, useEffect, useRef, useState } from 'react';
import { account } from '../lib/appwrite';
import { friendlyError } from '../lib/errorMessages.js';
import { endOfMonth, parseYMD, startOfMonth } from '../lib/reportsDateUtils.js';

export function useFunnelReport({
  enabled,
  academyId,
  preset,
  range,
  profileFilter,
  chartMode,
  onDateError,
}) {
  const reportAbortRef = useRef(null);
  const filterDebounceSkip = useRef(true);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs que mantêm o valor mais recente sem entrar nos deps do useCallback,
  // evitando que a mudança de profileFilter invalide fetchReport e cause double fetch.
  const profileFilterRef = useRef(profileFilter);
  profileFilterRef.current = profileFilter;

  const onDateErrorRef = useRef(onDateError);
  onDateErrorRef.current = onDateError;

  // Rastreia a chave do último fetch bem-sucedido para evitar re-fetch ao voltar
  // para a aba sem que o período tenha mudado.
  const lastFetchKeyRef = useRef(null);

  // Ref estável para a função fetchReport — permite que os effects usem a versão
  // mais recente sem precisar listá-la nos seus deps arrays.
  const fetchReportRef = useRef(null);

  // Cache de JWT por instância do hook (JWT do Appwrite válido por ~55 s).
  const jwtCacheRef = useRef({ token: null, expiresAt: 0 });

  const fetchReport = useCallback(
    async (forceRefresh = false) => {
      if (!academyId || !enabled) return false;

      if (preset === 'custom') {
        const fa = parseYMD(range.from);
        const ta = parseYMD(range.to);
        if (fa && ta && fa.getTime() > ta.getTime()) {
          onDateErrorRef.current?.('A data inicial deve ser anterior à data final.');
          setError(null);
          return false;
        }
      }
      onDateErrorRef.current?.(null);

      reportAbortRef.current?.abort();
      const controller = new AbortController();
      reportAbortRef.current = controller;
      setLoading(true);
      setError(null);

      const fromDay = parseYMD(range.from);
      const toDay = parseYMD(range.to);
      const toDEndLocal = new Date(toDay);
      toDEndLocal.setHours(23, 59, 59, 999);

      const prevFromDLocal = (() => {
        if (preset === 'today') {
          const d = new Date(fromDay);
          d.setDate(d.getDate() - 1);
          return d;
        }
        if (preset === 'week') {
          const d = new Date(fromDay);
          d.setDate(d.getDate() - 7);
          return d;
        }
        if (preset === 'month' || preset === 'last_month') {
          const d = new Date(fromDay.getFullYear(), fromDay.getMonth() - 1, 1);
          return startOfMonth(d);
        }
        const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
        const d = new Date(fromDay);
        d.setDate(d.getDate() - span);
        return d;
      })();

      const prevToDLocal = (() => {
        if (preset === 'today') {
          const d = new Date(toDEndLocal);
          d.setDate(d.getDate() - 1);
          d.setHours(23, 59, 59, 999);
          return d;
        }
        if (preset === 'week') {
          const d = new Date(toDEndLocal);
          d.setDate(d.getDate() - 7);
          return d;
        }
        if (preset === 'month' || preset === 'last_month') {
          return endOfMonth(new Date(prevFromDLocal));
        }
        const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
        const d = new Date(toDEndLocal);
        d.setDate(d.getDate() - span);
        return d;
      })();

      const fetchKey = `${academyId}|${range.from}|${range.to}|${preset}|${chartMode}`;

      try {
        let token;
        const now = Date.now();
        if (jwtCacheRef.current.token && now < jwtCacheRef.current.expiresAt) {
          token = jwtCacheRef.current.token;
        } else {
          const jwt = await account.createJWT();
          token = jwt.jwt;
          jwtCacheRef.current = { token, expiresAt: now + 50_000 };
        }

        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-academy-id': String(academyId || ''),
          },
          body: JSON.stringify({
            academyId,
            from: fromDay.toISOString(),
            to: toDEndLocal.toISOString(),
            prevFrom: prevFromDLocal.toISOString(),
            prevTo: prevToDLocal.toISOString(),
            filters: { origin: 'all', type: profileFilterRef.current },
            chartMode,
            refresh: forceRefresh === true,
          }),
          signal: controller.signal,
        });
        if (res.status === 504) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Muitos dados — tente um período menor');
        }
        if (!res.ok) throw new Error('Falha na resposta do servidor');
        const data = await res.json();
        if (!controller.signal.aborted) {
          setReportData(data);
          lastFetchKeyRef.current = fetchKey;
        }
        return true;
      } catch (e) {
        if (e?.name === 'AbortError') return false;
        setError(friendlyError(e, 'load'));
        setReportData(null);
        console.error(e);
        return false;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    // profileFilter e onDateError são lidos via ref — não precisam entrar nos deps.
    // Isso evita que a mudança de profileFilter invalide fetchReport e dispare o Effect 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [academyId, enabled, preset, range.from, range.to, chartMode]
  );

  // Manter ref em sincronia com a versão mais recente do callback.
  fetchReportRef.current = fetchReport;

  // Effect 1: dispara fetch quando período/preset/academyId/chartMode mudam.
  // NÃO inclui fetchReport nos deps para que mudanças de profileFilter (que invalidam
  // fetchReport via useCallback) não causem fetch duplicado.
  useEffect(() => {
    if (!enabled) return;
    const fetchKey = `${academyId}|${range.from}|${range.to}|${preset}|${chartMode}`;
    // Guard: se voltando à aba sem mudar período, não re-busca dados já carregados.
    if (lastFetchKeyRef.current === fetchKey) return;
    void fetchReportRef.current(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, chartMode, academyId, preset, enabled]);

  // Effect 2: profileFilter com debounce — único trigger de fetch para mudança de filtro.
  useEffect(() => {
    if (!enabled) return;
    if (filterDebounceSkip.current) {
      filterDebounceSkip.current = false;
      return;
    }
    const t = window.setTimeout(() => void fetchReportRef.current(false), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileFilter, enabled]);

  return {
    reportData,
    loading,
    error,
    fetchReport,
    showInitialLoad: loading && !reportData,
    showRefreshing: loading && Boolean(reportData),
  };
}
