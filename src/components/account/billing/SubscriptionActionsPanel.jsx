import React, { useState } from 'react';
import ConfirmDialog from '../../shared/ConfirmDialog.jsx';
import { useUiStore } from '../../../store/useUiStore';
import {
  postCancelSubscription,
  fetchPaymentMethodLink,
} from '../../../lib/billingApi';

export default function SubscriptionActionsPanel({
  storeId,
  billingLive,
  status,
  onChanged,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMode, setCancelMode] = useState('end_of_period');
  const [busy, setBusy] = useState(false);

  if (!billingLive || !storeId) return null;
  if (!status || status.status === 'preview' || status.status === 'inactive') return null;

  const canCancel = ['trial', 'active', 'past_due'].includes(status.status) && !status.cancelAtPeriodEnd;
  const showPaymentMethod =
    status.billingType === 'CREDIT_CARD' || status.status === 'past_due';

  const handleCancel = async () => {
    setBusy(true);
    try {
      await postCancelSubscription(storeId, cancelMode);
      addToast({
        type: 'success',
        message: cancelMode === 'immediate'
          ? 'Assinatura cancelada.'
          : 'Cancelamento agendado para o fim do período atual.',
      });
      setCancelOpen(false);
      onChanged?.();
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Não foi possível cancelar.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentLink = async () => {
    setBusy(true);
    try {
      const { url } = await fetchPaymentMethodLink(storeId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Link indisponível.' });
    } finally {
      setBusy(false);
    }
  };

  const cancelDescription = cancelMode === 'immediate'
    ? 'O acesso será encerrado imediatamente. Deseja continuar?'
    : 'Você mantém acesso até o fim do período atual. Recomendado para não perder o que já pagou.';

  return (
    <section className="billing-actions" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
      <h3 className="navi-section-title" style={{ fontSize: '1rem', marginBottom: 12 }}>Gerenciar assinatura</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {showPaymentMethod && (
          <button type="button" className="btn-outline" onClick={handlePaymentLink} disabled={busy}>
            Atualizar forma de pagamento
          </button>
        )}
        {canCancel && (
          <button type="button" className="btn-outline" onClick={() => { setCancelMode('end_of_period'); setCancelOpen(true); }} disabled={busy}>
            Cancelar assinatura
          </button>
        )}
      </div>

      {cancelOpen && (
        <p className="navi-subtitle" style={{ marginTop: 12 }}>
          <button type="button" className="btn-link" onClick={() => setCancelMode(cancelMode === 'immediate' ? 'end_of_period' : 'immediate')}>
            {cancelMode === 'end_of_period' ? 'Cancelar imediatamente em vez disso' : 'Voltar para cancelamento ao fim do período'}
          </button>
        </p>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar assinatura"
        description={cancelDescription}
        confirmLabel={cancelMode === 'immediate' ? 'Cancelar agora' : 'Agendar cancelamento'}
        cancelLabel="Voltar"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onClose={() => setCancelOpen(false)}
        loading={busy}
      />
    </section>
  );
}
