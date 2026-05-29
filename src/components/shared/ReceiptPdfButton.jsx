import React, { useState, useCallback } from 'react';
import { FileDown } from 'lucide-react';
import { useToast } from '../../hooks/useToast.js';
import AsyncButton from './AsyncButton.jsx';

/**
 * @param {() => Promise<void>} onDownload
 * @param {'outline'|'secondary'} [variant]
 * @param {string} [className]
 * @param {boolean} [disabled]
 */
export default function ReceiptPdfButton({
  onDownload,
  variant = 'outline',
  className = '',
  disabled = false,
  size = 'sm',
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onDownload();
      toast.success('PDF baixado.');
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (msg.includes('session_required')) {
        toast.error('Sessão expirada. Faça login novamente.');
      } else if (msg.includes('concluíd') || msg.includes('recebidos') || msg.includes('eligible')) {
        toast.warning('Este lançamento ainda não permite comprovante em PDF.');
      } else {
        toast.error(e, 'download');
      }
    } finally {
      setLoading(false);
    }
  }, [loading, disabled, onDownload, toast]);

  return (
    <AsyncButton
      type="button"
      variant={variant}
      size={size}
      className={className}
      loading={loading}
      disabled={disabled}
      onClick={handleClick}
    >
      <FileDown size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
      Baixar PDF
    </AsyncButton>
  );
}
