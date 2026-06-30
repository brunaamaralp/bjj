import React, { useCallback, useState } from 'react';
import StatusBadge from '../shared/StatusBadge.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { useUserRole } from '../../lib/useUserRole.js';
import { runPagbankSetup } from '../../lib/pagbankSetupApi.js';

const INTEGRATION_STATUS_MAP = {
  active: { label: 'Ativa', tone: 'success' },
  inactive: { label: 'Inativa', tone: 'neutral' },
};

const PLAN_RESULT_STATUS_MAP = {
  created: { label: 'Criado', tone: 'success' },
  existing: { label: 'Já existia', tone: 'info' },
  failed: { label: 'Falhou', tone: 'danger' },
};

const MODALITY_OPTIONS = [
  { value: 'adulto', label: 'Adulto' },
  { value: 'kids', label: 'Kids' },
  { value: 'familia', label: 'Família' },
  { value: 'outro', label: 'Outro' },
];

const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
];

const EMPTY_PLAN = {
  internal_key: '',
  name: '',
  modality: 'adulto',
  frequency: 'monthly',
  amount: '',
};

function PlanRow({ plan, index, onChange, onRemove, canRemove }) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        marginBottom: 10,
        background: 'var(--surface, var(--color-surface))',
      }}
    >
      <div className="settings-form" style={{ display: 'grid', gap: 10 }}>
        <div className="form-group">
          <label>Chave interna</label>
          <input
            className="form-input"
            placeholder="GBLP_ADU_MEN_150"
            value={plan.internal_key}
            onChange={(e) => onChange(index, { internal_key: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Nome do plano</label>
          <input
            className="form-input"
            placeholder="Adulto Mensal"
            value={plan.name}
            onChange={(e) => onChange(index, { name: e.target.value })}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label>Modalidade</label>
            <select
              className="form-input"
              value={plan.modality}
              onChange={(e) => onChange(index, { modality: e.target.value })}
            >
              {MODALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Frequência</label>
            <select
              className="form-input"
              value={plan.frequency}
              onChange={(e) => onChange(index, { frequency: e.target.value })}
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Valor (R$)</label>
          <input
            className="form-input"
            type="text"
            inputMode="decimal"
            placeholder="150,00"
            value={plan.amount}
            onChange={(e) => onChange(index, { amount: e.target.value })}
          />
        </div>
        {canRemove ? (
          <button type="button" className="btn-outline btn-sm" onClick={() => onRemove(index)}>
            Remover plano
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SetupResult({ result }) {
  const planRows = Array.isArray(result?.plans) ? result.plans : [];

  return (
    <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--color-accent)' }}>
      <p style={{ fontWeight: 500, marginBottom: 8 }}>Integração configurada</p>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>URL do webhook</strong> para configurar no painel PagBank:
        <code
          style={{
            display: 'block',
            marginTop: 4,
            padding: '6px 10px',
            background: 'var(--color-primary-surface)',
            borderRadius: 6,
            wordBreak: 'break-all',
          }}
        >
          {result.webhook_url}
        </code>
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>Webhook Secret</strong>:
        <code
          style={{
            display: 'block',
            marginTop: 4,
            padding: '6px 10px',
            background: 'var(--color-primary-surface)',
            borderRadius: 6,
            wordBreak: 'break-all',
          }}
        >
          {result.webhook_secret}
        </code>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Guarde este secret em local seguro. Ele não será exibido novamente. Copie a URL e o secret e
        configure no painel PagBank em Cobranças → Webhooks.
      </p>
      {planRows.length ? (
        <div style={{ marginTop: 12 }}>
          {planRows.map((p) => (
            <div
              key={p.internal_key}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
                marginBottom: 4,
                flexWrap: 'wrap',
              }}
            >
              <StatusBadge
                status={p.status === 'created' ? 'created' : p.status === 'existing' ? 'existing' : 'failed'}
                map={PLAN_RESULT_STATUS_MAP}
              />
              <span>{p.internal_key}</span>
              {p.plan_id ? <span style={{ color: 'var(--text-muted)' }}>{p.plan_id}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PagBankSetupSection({ academy, academyId, onSaved }) {
  const role = useUserRole(academy);
  const [token, setToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [plans, setPlans] = useState([{ ...EMPTY_PLAN }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const pagbankEnabled = academy?.pagbank_enabled === true;

  const addPlan = useCallback(() => {
    setPlans((prev) => (prev.length >= 20 ? prev : [...prev, { ...EMPTY_PLAN }]));
  }, []);

  const updatePlan = useCallback((index, patch) => {
    setPlans((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }, []);

  const removePlan = useCallback((index) => {
    setPlans((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  async function handleSave() {
    if (!token.trim()) {
      setError('Token PagBank é obrigatório');
      return;
    }

    for (const p of plans) {
      if (!p.internal_key.trim() || !p.name.trim() || !p.amount) {
        setError('Preencha todos os campos de cada plano');
        return;
      }
      const amt = Math.round(parseFloat(String(p.amount).replace(',', '.')) * 100);
      if (Number.isNaN(amt) || amt <= 0) {
        setError('Valor inválido em um dos planos');
        return;
      }
    }

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        pagbank_token: token.trim(),
        ...(webhookSecret.trim() ? { pagbank_webhook_secret: webhookSecret.trim() } : {}),
        plans: plans.map((p) => ({
          internal_key: p.internal_key.trim().toUpperCase(),
          name: p.name.trim(),
          modality: p.modality,
          frequency: p.frequency,
          amount: Math.round(parseFloat(String(p.amount).replace(',', '.')) * 100),
        })),
      };
      const data = await runPagbankSetup(academyId, payload);
      setResult(data);
      setToken('');
      setWebhookSecret('');
      onSaved?.();
    } catch (e) {
      if (e.status === 422) {
        setError('Token PagBank inválido — verifique nas configurações da sua conta');
      } else if (e.status === 403) {
        setError('Sem permissão para configurar integrações');
      } else {
        setError(e.detail?.detail || e.message || 'Erro ao salvar configuração');
      }
    } finally {
      setSaving(false);
    }
  }

  if (role === 'member' || role === 'guest') {
    return (
      <div className="finance-settings-section-body">
        <div className="card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            Apenas o dono ou admin da academia pode configurar integrações de pagamento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="finance-settings-section-body">
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500 }}>PagBank Recorrente</span>
          <StatusBadge
            status={pagbankEnabled ? 'active' : 'inactive'}
            map={INTEGRATION_STATUS_MAP}
          />
        </div>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 0 }}>
          Permite cobranças automáticas de mensalidades via cartão de crédito. O aluno cadastra o
          cartão uma vez e é cobrado automaticamente todo mês.
        </p>
        {pagbankEnabled ? (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 0 }}>
            Integração ativa — você pode atualizar o token e os planos abaixo.
          </p>
        ) : null}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="settings-form">
          <div className="form-group">
            <label>
              Token PagBank <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              className="form-input"
              type="password"
              placeholder="Bearer token da sua conta PagBank"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <span className="form-hint">Encontre em: Painel PagBank → Configurações → Credenciais</span>
          </div>
          <div className="form-group">
            <label>
              Webhook Secret{' '}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                (opcional — gerado automaticamente se vazio)
              </span>
            </label>
            <input
              className="form-input"
              type="password"
              placeholder="Deixe vazio para gerar automaticamente"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 500 }}>Planos de cobrança</span>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={addPlan}
            disabled={plans.length >= 20}
          >
            + Adicionar plano
          </button>
        </div>
        {plans.map((plan, i) => (
          <PlanRow
            key={i}
            plan={plan}
            index={i}
            onChange={updatePlan}
            onRemove={removePlan}
            canRemove={plans.length > 1}
          />
        ))}
      </div>

      {result ? <SetupResult result={result} /> : null}
      {error ? <ErrorBanner message={error} className="mt-3" /> : null}

      <AsyncButton loading={saving} onClick={handleSave} className="btn-primary" style={{ marginTop: 16 }}>
        {pagbankEnabled ? 'Atualizar configuração' : 'Conectar PagBank'}
      </AsyncButton>
    </div>
  );
}
