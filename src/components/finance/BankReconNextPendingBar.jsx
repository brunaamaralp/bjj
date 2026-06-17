import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

export default function BankReconNextPendingBar({
  unmatchedItems = [],
  selectedItemId = '',
  busy = false,
  onSelectNext,
}) {
  const total = unmatchedItems.length;
  const currentIndex = useMemo(() => {
    if (!selectedItemId) return -1;
    return unmatchedItems.findIndex((item) => item.id === selectedItemId);
  }, [unmatchedItems, selectedItemId]);

  if (total === 0) return null;

  const position = currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <div className="bank-recon-mobile-footer" role="region" aria-label="Navegação de pendências">
      <button
        type="button"
        className="btn-outline btn-sm bank-recon-mobile-footer__next"
        disabled={busy}
        onClick={() => onSelectNext?.()}
      >
        <ChevronRight size={16} aria-hidden />
        Próximo pendente
        <span className="bank-recon-mobile-footer__count">
          {position > 0 ? `${position}/${total}` : `${total} pendente(s)`}
        </span>
      </button>
    </div>
  );
}
