import '../styles/equipe.css';
import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';
import EquipeSection from '../components/academy/EquipeSection';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';

function EquipePageBody({ academyId, academyList, onMetaChange }) {
  const [loadState, setLoadState] = useState('loading');
  const [academy, setAcademy] = useState({ teamId: '', ownerId: '' });

  useEffect(() => {
    let cancelled = false;
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

  if (loadState === 'loading') {
    return <PageSkeleton variant="list" rows={3} />;
  }

  return (
    <EquipeSection
      academy={academyForSection}
      academyId={academyId}
      onMetaChange={onMetaChange}
    />
  );
}

export default function Equipe() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [pageMeta, setPageMeta] = useState(null);

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
        {academyId ? (
          <EquipePageBody
            key={academyId}
            academyId={academyId}
            academyList={academyList}
            onMetaChange={setPageMeta}
          />
        ) : (
          <p className="text-small text-muted">Selecione uma academia para gerenciar a equipe.</p>
        )}
      </div>
    </div>
  );
}
