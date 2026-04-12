import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, CreditCard } from 'lucide-react';
import { createSessionJwt } from '../lib/appwrite';
import { isBillingLive } from '../lib/billingEnabled';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';

const PLAN_SLUG_BETA = 'beta';

const BILLING_TYPES = [
  { id: 'PIX', label: 'PIX' },
  { id: 'BOLETO', label: 'Boleto' },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const Plans = ({ user }) => {
  const billingLive = isBillingLive();
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);
  const [planPrice, setPlanPrice] = useState(297);
  const [billingType, setBillingType] = useState('PIX');
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    cpfCnpj: '',
    phone: '',
    postalCode: '',
    address: '',
    addressNumber: '',
    complement: '',
    neighborhood: '',
    uf: '',
    city: '',
  });

  useEffect(() => {
    if (!billingLive) {
      setLoadingPlans(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/billing/plans');
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && Array.isArray(d.plans) && d.plans[0]) {
          const v = Number(d.plans[0].value);
          if (Number.isFinite(v)) setPlanPrice(v);
        }
      } catch {
        void 0;
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billingLive]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!billingLive) {
      addToast({ type: 'info', message: 'Assinatura ainda não está ativa. Em breve.' });
      return;
    }
    if (!academyId) {
      addToast({ type: 'error', message: 'Nenhuma academia selecionada.' });
      return;
    }
    const jwt = await createSessionJwt();
    if (!jwt) {
      addToast({ type: 'error', message: 'Sessão inválida. Entre novamente.' });
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          storeId: academyId,
          planSlug: PLAN_SLUG_BETA,
          billingType,
          customer: form,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.erro || data.error || 'Falha ao iniciar checkout');
      }
      const url = data.paymentUrl;
      if (url && url.startsWith('http')) {
        window.location.href = url;
        return;
      }
      addToast({
        type: 'success',
        message: data.reused ? 'Retomando link de pagamento recente.' : 'Checkout criado. Conclua o pagamento no Asaas.',
      });
    } catch (err) {
      addToast({ type: 'error', message: String(err?.message || err) });
    } finally {
      setLoading(false);
    }
  };

  const priceLabel = loadingPlans && billingLive ? '…' : planPrice.toFixed(2).replace('.', ',');

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <div className="animate-in">
        <Link to="/" className="navi-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Voltar ao início
        </Link>
        <h2 className="navi-page-title">Nave Beta</h2>
        <p className="navi-subtitle" style={{ marginTop: 6 }}>
          Um plano mensal com pagamento seguro via Asaas (PIX, boleto ou cartão). Preencha os dados de faturamento abaixo.
        </p>
        {!billingLive && (
          <p
            className="navi-subtitle"
            style={{
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--warn-bg, rgba(234, 179, 8, 0.12))',
              color: 'var(--warn-text, #854d0e)',
            }}
          >
            Prévia: cobrança desativada. O botão de pagamento só será liberado quando a assinatura for ativada no deploy.
          </p>
        )}
      </div>

      <div className="card mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="action-icon"
            style={{
              background: 'var(--accent-light)',
              color: 'var(--accent)',
            }}
          >
            <CreditCard size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <strong className="text-small">Nave Beta</strong>
            <p className="navi-subtitle" style={{ marginTop: 4 }}>
              Acesso completo a todas as funcionalidades durante o beta.
            </p>
            <p className="navi-page-title" style={{ marginTop: 12, fontSize: '1.75rem' }}>
              R$ {priceLabel}
              <span className="navi-subtitle" style={{ fontSize: '1rem', fontWeight: 500 }}>
                {' '}
                /mês
              </span>
            </p>
            <p className="navi-subtitle" style={{ marginTop: 8 }}>
              30 dias grátis incluídos (trial). Depois, cobrança mensal no Asaas.
            </p>
            <p className="navi-subtitle" style={{ marginTop: 6 }}>
              Métodos: PIX · Boleto · Cartão de crédito
            </p>
          </div>
        </div>

        <form className="flex-col gap-3" onSubmit={onSubmit}>
          <div className="form-group">
            <label>Forma de pagamento</label>
            <select className="form-input" value={billingType} onChange={(e) => setBillingType(e.target.value)} disabled={!billingLive}>
              {BILLING_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nome completo / razão social</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>CPF ou CNPJ</label>
            <input className="form-input" value={form.cpfCnpj} onChange={(e) => setForm((f) => ({ ...f, cpfCnpj: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>Telefone (opcional)</label>
            <input className="form-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>CEP</label>
            <input className="form-input" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>Endereço (logradouro)</label>
            <input className="form-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>Número</label>
            <input className="form-input" value={form.addressNumber} onChange={(e) => setForm((f) => ({ ...f, addressNumber: e.target.value }))} required disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>Complemento</label>
            <input className="form-input" value={form.complement} onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))} disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>Bairro</label>
            <input className="form-input" value={form.neighborhood} onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))} disabled={!billingLive} />
          </div>
          <div className="form-group">
            <label>UF</label>
            <input
              className="form-input"
              maxLength={2}
              placeholder="SP"
              value={form.uf}
              onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
              required
              disabled={!billingLive}
            />
          </div>
          <div className="form-group">
            <label>Cidade</label>
            <input className="form-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required disabled={!billingLive} />
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !billingLive}>
            {!billingLive ? 'Pagamento em breve' : loading ? 'Redirecionando…' : 'Começar trial gratuito'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Plans;
