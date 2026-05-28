import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import EquipeSection from '../components/academy/EquipeSection';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';

export default function Equipe() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [loadState, setLoadState] = useState('idle');
  const [academy, setAcademy] = useState({ teamId: '', ownerId: '' });
  const [pageMeta, setPageMeta] = useState(null);

  useEffect(() => {
    if (!academyId) {
      setLoadState('idle');
      setAcademy({ teamId: '', ownerId: '' });
      setPageMeta(null);
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
    <div className="container navi-hub-page">
      <div className="navi-hub-page__head">
        <PageHeader
          title="Equipe"
          subtitle="Convide colaboradores, defina papéis e acompanhe alterações de acesso."
          meta={pageMeta}
        />
      </div>

      <div className="navi-hub-page__body equipe-page">
        {loadState === 'loading' ? (
          <PageSkeleton variant="list" rows={3} />
        ) : null}

        {loadState !== 'loading' && academyId ? (
          <EquipeSection
            academy={academyForSection}
            academyId={academyId}
            onMetaChange={setPageMeta}
          />
        ) : null}

        {!academyId ? (
          <p className="text-small text-muted">Selecione uma academia para gerenciar a equipe.</p>
        ) : null}
      </div>
    </div>
  );
}
