import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { planTemplateSelectValue, templatesForPurpose } from '../../../lib/contractPlanTemplates.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../../lib/financeiroReceivablesSections.js';
import {
  centsToNumber,
  formatBRLFromCents,
  maskFromNumber,
  parseMaskToCents,
} from '../../../lib/moneyBr.js';
import EmptyState from '../../shared/EmptyState.jsx';
import FieldError from '../../shared/FieldError.jsx';
import ModalShell from '../../shared/ModalShell.jsx';
import FinanceSettingsDiscountPresetsSection from './FinanceSettingsDiscountPresetsSection.jsx';

function formatPlanPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PlanPriceInput({ id, value, disabled, onChangeNumber, 'aria-describedby': ariaDescribedBy }) {
  const [text, setText] = useState(() => maskFromNumber(value) || '');

  useEffect(() => {
    setText(maskFromNumber(value) || '');
  }, [value]);

  return (
    <input
      id={id}
      className="form-input"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={text}
      aria-describedby={ariaDescribedBy}
      onChange={(e) => {
        const cents = parseMaskToCents(e.target.value);
        setText(formatBRLFromCents(cents));
        onChangeNumber(centsToNumber(cents) ?? 0);
      }}
    />
  );
}

function PlanListItem({ pl, idx, expanded, onToggle, onUpdate, onRemove, enrollmentTemplates, rescissionTemplates }) {
  const name = String(pl.name || '').trim() || 'Plano sem nome';
  const priceLabel = pl.isExempt === true ? 'Isento' : formatPlanPrice(pl.price);
  const enrollmentValue = planTemplateSelectValue(pl.contractTemplateId, enrollmentTemplates);
  const rescissionValue = planTemplateSelectValue(pl.rescissionTemplateId, rescissionTemplates);
  const priceHintId = `plan-price-hint-${idx}`;

  return (
    <div className={`finance-settings-plan${expanded ? ' finance-settings-plan--open' : ''}`}>
      <button type="button" className="finance-settings-plan__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="finance-settings-plan__name">{name}</span>
        <span className="finance-settings-plan__price">{priceLabel}</span>
        {expanded ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {expanded ? (
        <div className="finance-settings-plan__body">
          <div className="form-group">
            <label htmlFor={`plan-name-${idx}`}>Nome</label>
            <input
              id={`plan-name-${idx}`}
              className="form-input"
              value={pl.name || ''}
              onChange={(e) => onUpdate(idx, { name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`plan-price-${idx}`}>Preço de lista (R$)</label>
            <PlanPriceInput
              id={`plan-price-${idx}`}
              value={pl.price ?? 0}
              disabled={pl.isExempt === true}
              aria-describedby={priceHintId}
              onChangeNumber={(n) => onUpdate(idx, { price: n })}
            />
            <p id={priceHintId} className="text-small text-muted">
              Preço de lista para novas matrículas. Alunos já matriculados mantêm o valor acordado no
              perfil; alterar aqui não reajusta a base antiga.
            </p>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={pl.isExempt === true}
                onChange={(e) => onUpdate(idx, { isExempt: e.target.checked })}
              />
              <span>Este plano não gera cobrança mensal</span>
            </label>
            <p className="text-small text-muted">
              Alunos deste plano aparecem como isentos em Mensalidades e ficam fora da cobrança.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`plan-checkins-${idx}`}>Meta semanal de check-ins</label>
            <input
              id={`plan-checkins-${idx}`}
              className="form-input"
              type="number"
              min={1}
              max={7}
              value={pl.weeklyCheckinsExpected ?? ''}
              onChange={(e) => {
                const raw = String(e.target.value || '').trim();
                onUpdate(idx, {
                  weeklyCheckinsExpected: raw === '' ? null : Number(raw),
                });
              }}
              placeholder="2 (padrão)"
            />
            <p className="text-small text-muted">
              Quantos treinos por semana o aluno deste plano deveria fazer. Usada na aba Retenção da
              catraca; turma pode sobrescrever se o plano não tiver meta.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`plan-desc-${idx}`}>Descrição</label>
            <input
              id={`plan-desc-${idx}`}
              className="form-input"
              value={pl.description || ''}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
            />
            <p className="text-small text-muted">Opcional — nota interna; não aparece no modal de pagamento.</p>
          </div>
          <div className="form-group">
            <label htmlFor={`plan-fee-${idx}`}>Repasse taxas de pagamento ao aluno</label>
            <select
              id={`plan-fee-${idx}`}
              className="form-input"
              value={pl.applyCardFee ? 'sim' : 'nao'}
              onChange={(e) => onUpdate(idx, { applyCardFee: e.target.value === 'sim' })}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
            <p className="text-small text-muted">
              Quando ativo, cartão e PIX podem acrescer taxas configuradas em Taxas — repasse ao aluno,
              não o desconto da operadora no banco.
            </p>
          </div>
          {enrollmentTemplates.length > 0 ? (
            <div className="form-group">
              <label htmlFor={`plan-enroll-tpl-${idx}`}>Contrato de matrícula (opcional)</label>
              <select
                id={`plan-enroll-tpl-${idx}`}
                className="form-input"
                value={enrollmentValue}
                onChange={(e) => onUpdate(idx, { contractTemplateId: e.target.value || null })}
              >
                <option value="">Nenhum</option>
                {enrollmentTemplates.map((t) => (
                  <option key={t.$id} value={t.$id}>
                    {t.name || t.title || 'Modelo'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {rescissionTemplates.length > 0 ? (
            <div className="form-group">
              <label htmlFor={`plan-resc-tpl-${idx}`}>Termo de rescisão (opcional)</label>
              <select
                id={`plan-resc-tpl-${idx}`}
                className="form-input"
                value={rescissionValue}
                onChange={(e) => onUpdate(idx, { rescissionTemplateId: e.target.value || null })}
              >
                <option value="">Nenhum</option>
                {rescissionTemplates.map((t) => (
                  <option key={t.$id} value={t.$id}>
                    {t.name || t.title || 'Modelo'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="button" className="btn-outline btn-sm finance-settings-plan__remove" onClick={() => onRemove(idx)}>
            <Trash2 size={14} aria-hidden />
            Remover plano
          </button>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_DRAFT = { name: '', price: 0, isExempt: false };

function CreatePlanModal({ open, onClose, onSubmit }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [nameError, setNameError] = useState('');
  const [priceError, setPriceError] = useState('');
  const nameId = useId();
  const priceId = useId();
  const nameErrId = useId();
  const priceErrId = useId();
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY_DRAFT);
    setNameError('');
    setPriceError('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => nameRef.current?.focus?.(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const name = String(draft.name || '').trim();
    let ok = true;
    if (!name) {
      setNameError('Informe o nome do plano.');
      ok = false;
    } else {
      setNameError('');
    }
    if (!draft.isExempt && !(Number(draft.price) > 0)) {
      setPriceError('Informe um preço maior que zero.');
      ok = false;
    } else {
      setPriceError('');
    }
    if (!ok) return;
    onSubmit({
      name,
      price: draft.isExempt ? 0 : Number(draft.price) || 0,
      isExempt: draft.isExempt === true,
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Adicionar plano"
      maxWidth={440}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="finance-create-plan-form" className="btn-primary">
            Adicionar
          </button>
        </>
      }
    >
      <form id="finance-create-plan-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor={nameId}>Nome</label>
          <input
            ref={nameRef}
            id={nameId}
            className="form-input"
            value={draft.name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrId : undefined}
            onChange={(e) => {
              setDraft((d) => ({ ...d, name: e.target.value }));
              if (nameError) setNameError('');
            }}
          />
          <FieldError id={nameErrId}>{nameError}</FieldError>
        </div>
        <div className="form-group">
          <label htmlFor={priceId}>Preço de lista (R$)</label>
          <PlanPriceInput
            id={priceId}
            value={draft.price}
            disabled={draft.isExempt}
            aria-describedby={priceError ? priceErrId : undefined}
            onChangeNumber={(n) => {
              setDraft((d) => ({ ...d, price: n }));
              if (priceError) setPriceError('');
            }}
          />
          <FieldError id={priceErrId}>{priceError}</FieldError>
        </div>
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.isExempt}
              onChange={(e) => {
                const isExempt = e.target.checked;
                setDraft((d) => ({ ...d, isExempt, price: isExempt ? 0 : d.price }));
                if (priceError) setPriceError('');
              }}
            />
            <span>Este plano não gera cobrança mensal</span>
          </label>
        </div>
      </form>
    </ModalShell>
  );
}

export default function FinanceSettingsPlansSection({
  financeConfig,
  contractTemplates,
  contractTemplatesConfigured,
  rescissionTemplates,
  runEnsureContractSetup,
  ensureContractSetup,
  onUpdate,
  onAdd,
  onRemoveRequest,
  discountPresets,
  onDiscountPresetsChange,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const plans = financeConfig.plans || [];
  const enrollmentTemplates = templatesForPurpose(contractTemplates, 'enrollment');

  const openCreate = () => setCreateOpen(true);

  const handleCreate = (payload) => {
    onAdd(payload);
    setCreateOpen(false);
    setExpandedIdx(plans.length);
  };

  return (
    <div className="finance-settings-section-body">
      <p className="finance-settings-lead">
        Usados na matrícula e em Mensalidades. O <strong>preço de lista</strong> vale para novas
        matrículas; alunos já matriculados usam o <strong>valor acordado</strong> no perfil. O{' '}
        <strong>dia de vencimento</strong> fica no cadastro de cada aluno (campo &quot;Vence
        dia&quot;). Contratos são opcionais; vincule em{' '}
        <Link to="/empresa?tab=contratos" className="edit-link">
          Contratos
        </Link>
        .
      </p>

      {contractTemplatesConfigured && rescissionTemplates.length === 0 ? (
        <div className="finance-config-setup-banner card">
          <p className="text-small text-muted">
            Falta o termo de rescisão padrão. Gere modelos em Contratos quando quiser usar rescisão automática.
          </p>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={ensureContractSetup.isPending}
            onClick={() => void runEnsureContractSetup({ showToast: true })}
          >
            {ensureContractSetup.isPending ? 'Configurando…' : 'Configurar contratos'}
          </button>
        </div>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          title="Nenhum plano cadastrado"
          description="Crie planos para usar na matrícula e nas mensalidades."
          primaryAction={{ label: 'Adicionar plano', onClick: openCreate }}
        />
      ) : (
        <div className="finance-settings-plan-list card">
          {plans.map((pl, idx) => (
            <React.Fragment key={`plan-${idx}`}>
              {idx > 0 ? <div className="finance-settings-group__sep" aria-hidden /> : null}
              <PlanListItem
                pl={pl}
                idx={idx}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx((cur) => (cur === idx ? null : idx))}
                onUpdate={onUpdate}
                onRemove={onRemoveRequest}
                enrollmentTemplates={enrollmentTemplates}
                rescissionTemplates={rescissionTemplates}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {plans.length > 0 ? (
        <button type="button" className="finance-settings-add-row edit-link" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          Adicionar plano
        </button>
      ) : null}

      <Link
        to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.MENSALIDADES })}
        className="finance-config-context-link"
      >
        Ver em Mensalidades →
      </Link>

      <FinanceSettingsDiscountPresetsSection
        presets={discountPresets}
        onChange={onDiscountPresetsChange}
      />

      <CreatePlanModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}
