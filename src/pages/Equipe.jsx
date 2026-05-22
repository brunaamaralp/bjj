import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import EquipeSection from '../components/academy/EquipeSection';

export default function Equipe() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [loadState, setLoadState] = useState('idle');
  const [academy, setAcademy] = useState({ teamId: '', ownerId: '' });

  useEffect(() => {
    if (!academyId) {
      setLoadState('idle');
      setAcademy({ teamId: '', ownerId: '' });
      return undefined;
    }
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const doc = await getAcademyDocument(academyId);
        if (cancelled) return;
        setAcademy({
          teamId: doc.teamId || '',
          ownerId: String(doc.ownerId || ''),
        });
        setLoadState('ok');
      } catch {
        if (!cancelled) {
          const fromList = (academyList || []).find((a) => a.id === academyId);
          setAcademy({
            teamId: '',
            ownerId: String(fromList?.ownerId || ''),
          });
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, academyList]);

  const academyForSection = useMemo(() => {
    const fromList = (academyList || []).find((a) => a.id === academyId);
    return {
      teamId: String(academy.teamId || fromList?.teamId || ''),
      ownerId: String(academy.ownerId || fromList?.ownerId || ''),
    };
  }, [academy, academyList, academyId]);

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Equipe</h1>
        <p className="navi-subtitle" style={{ marginTop: 6, marginBottom: 16 }}>
          Membros, permissões e auditoria de acesso.
        </p>
      </div>

      {loadState === 'loading' ? (
        <p className="text-small text-muted" role="status" aria-live="polite">
          Carregando…
        </p>
      ) : null}

      {loadState !== 'loading' && academyId ? (
        <EquipeSection academy={academyForSection} academyId={academyId} />
      ) : null}

      {!academyId ? (
        <p className="text-small text-muted">Selecione uma academia para gerenciar a equipe.</p>
      ) : null}
    </div>
  );
}
