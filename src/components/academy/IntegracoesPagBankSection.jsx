import React, { useCallback, useEffect, useState } from 'react';
import PagBankSetupSection from '../finance/PagBankSetupSection.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { getAcademyDocument, invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';

export default function IntegracoesPagBankSection({ academyId, embeddedInLayout = false }) {
  const [academy, setAcademy] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    async (force = false) => {
      if (!academyId) {
        setAcademy(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const doc = await getAcademyDocument(academyId, { force });
        setAcademy({ pagbank_enabled: doc.pagbank_enabled === true });
      } catch {
        setAcademy({ pagbank_enabled: false });
      } finally {
        setLoading(false);
      }
    },
    [academyId]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSaved = useCallback(() => {
    invalidateAcademyDocumentCache(academyId);
    void reload(true);
  }, [academyId, reload]);

  if (!academyId) {
    return (
      <p className="text-small text-muted">Selecione uma academia para configurar o PagBank.</p>
    );
  }

  if (loading) {
    return <PageSkeleton variant="list" rows={4} />;
  }

  return (
    <div className={embeddedInLayout ? '' : 'integracoes-pagbank-section'}>
      <PagBankSetupSection academy={academy} academyId={academyId} onSaved={onSaved} />
    </div>
  );
}
