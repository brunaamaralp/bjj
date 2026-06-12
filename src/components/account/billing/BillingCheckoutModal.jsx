import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../../shared/ModalShell.jsx';
import FieldError from '../../shared/FieldError.jsx';
import { useUiStore } from '../../../store/useUiStore';
import { PLAN_CONFIG } from '../../../lib/planConfig';
import { postCheckout } from '../../../lib/billingApi';

const BILLING_TYPES = [
  { id: 'PIX', label: 'PIX' },
  { id: 'BOLETO', label: 'Boleto' },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const EMPTY_CUSTOMER = {
  name: '',
  email: '',
  cpfCnpj: '',
  postalCode: '',
  address: '',
  addressNumber: '',
  neighborhood: '',
  city: '',
  uf: '',
  phone: '',
  complement: '',
};

export default function BillingCheckoutModal({
  open,
  onClose,
  planSlug,
  storeId,
  prefill = {},
  onSuccess,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const plan = PLAN_CONFIG[planSlug];
  const [step, setStep] = useState(0);
  const [billingType, setBillingType] = useState('PIX');
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBillingType('PIX');
    setFieldError('');
    setCustomer({
      ...EMPTY_CUSTOMER,
      name: String(prefill.name || '').trim(),
      email: String(prefill.email || '').trim(),
      cpfCnpj: String(prefill.cpfCnpj || '').trim(),
      phone: String(prefill.phone || '').trim(),
      postalCode: String(prefill.postalCode || '').trim(),
      address: String(prefill.address || '').trim(),
      addressNumber: String(prefill.addressNumber || '').trim(),
      neighborhood: String(prefill.neighborhood || '').trim(),
      city: String(prefill.city || '').trim(),
      uf: String(prefill.uf || '').trim().toUpperCase().slice(0, 2),
      complement: String(prefill.complement || '').trim(),
    });
  }, [open, prefill, planSlug]);

  if (!plan) return null;

  const setField = (key, value) => {
    setCustomer((c) => ({ ...c, [key]: value }));
    setFieldError('');
  };

  const handleSubmit = async () => {
    setFieldError('');
    setLoading(true);
    try {
      const data = await postCheckout({
        storeId,
        planSlug,
        billingType,
        customer: {
          ...customer,
          province: customer.uf,
        },
      });
      const url = data.paymentUrl;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        addToast({
          type: 'info',
          message: 'Conclua o pagamento na janela aberta. O plano será ativado após a confirmação.',
        });
      } else {
        addToast({ type: 'success', message: 'Checkout iniciado. Aguarde a confirmação do pagamento.' });
      }
      onSuccess?.();
      onClose?.();
    } catch (e) {
      const msg = e?.message || 'Não foi possível iniciar o pagamento.';
      setFieldError(msg);
      if (e?.code === 'TAX_IN_USE') {
        addToast({ type: 'error', message: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
        Cancelar
      </button>
      {step > 0 && (
        <button type="button" className="btn-outline" onClick={() => setStep((s) => s - 1)} disabled={loading}>
          Voltar
        </button>
      )}
      {step < 2 ? (
        <button
          type="button"
          className="btn-primary"
          onClick={() => setStep((s) => s + 1)}
          disabled={loading}
        >
          Continuar
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Processando…' : 'Ir para pagamento'}
        </button>
      )}
    </div>
  );

  return (
    <ModalShell
      open={open}
      title={`Assinar plano ${plan.name}`}
      onClose={onClose}
      maxWidth={520}
      footer={footer}
    >
      {step === 0 && (
        <div className="billing-checkout-step">
          <p className="navi-subtitle" style={{ marginTop: 0 }}>
            {plan.description}
          </p>
          <p className="navi-page-title" style={{ fontSize: '1.75rem', margin: '8px 0' }}>
            R$ {plan.price.toLocaleString('pt-BR')}
            <span className="navi-subtitle" style={{ fontSize: '0.9rem' }}> /mês</span>
          </p>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            {plan.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {step === 1 && (
        <div className="billing-checkout-step" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Nome completo / Razão social</label>
            <input className="form-input" value={customer.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" className="form-input" value={customer.email} onChange={(e) => setField('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>CPF ou CNPJ</label>
            <input className="form-input" value={customer.cpfCnpj} onChange={(e) => setField('cpfCnpj', e.target.value)} placeholder="Somente números" />
          </div>
          <div className="form-group">
            <label>Telefone</label>
            <input className="form-input" value={customer.phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>CEP</label>
              <input className="form-input" value={customer.postalCode} onChange={(e) => setField('postalCode', e.target.value)} />
            </div>
            <div className="form-group">
              <label>UF</label>
              <input className="form-input" maxLength={2} value={customer.uf} onChange={(e) => setField('uf', e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="form-group">
            <label>Endereço</label>
            <input className="form-input" value={customer.address} onChange={(e) => setField('address', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Número</label>
              <input className="form-input" value={customer.addressNumber} onChange={(e) => setField('addressNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Bairro</label>
              <input className="form-input" value={customer.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Cidade</label>
            <input className="form-input" value={customer.city} onChange={(e) => setField('city', e.target.value)} />
          </div>
          <p className="text-small" style={{ margin: 0, color: 'var(--text-muted)' }}>
            Também pode cadastrar em{' '}
            <Link to="/empresa">Configurações da academia</Link>.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="billing-checkout-step">
          <p className="navi-subtitle" style={{ marginTop: 0 }}>
            Você será redirecionado ao ambiente seguro Asaas para concluir o pagamento.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            {BILLING_TYPES.map((t) => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="billingType"
                  checked={billingType === t.id}
                  onChange={() => setBillingType(t.id)}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {fieldError ? <FieldError>{fieldError}</FieldError> : null}
    </ModalShell>
  );
}
