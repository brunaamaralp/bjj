import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { templatesForPurpose } from '../../lib/contractPlanTemplates.js';
import {
  FINANCE_SETTINGS_SECTIONS,
  isFinanceSettingsSection,
  FINANCE_SETTINGS_GROUPS,
} from '../../lib/financeSettingsSections.js';
import { useFinanceConfigState } from '../../hooks/useFinanceConfigState.js';
import { useAccountingStore } from '../../store/useAccountingStore';
import CaixaAccountingPanel from './CaixaAccountingPanel.jsx';
import FinanceSettingsHub from './settings/FinanceSettingsHub.jsx';
import FinanceSettingsDetailHeader from './settings/FinanceSettingsDetailHeader.jsx';
import FinanceSettingsStickySave from './settings/FinanceSettingsStickySave.jsx';
import FinanceSettingsPlansSection from './settings/FinanceSettingsPlansSection.jsx';
import FinanceSettingsFeesSection from './settings/FinanceSettingsFeesSection.jsx';
import FinanceSettingsBanksSection from './settings/FinanceSettingsBanksSection.jsx';
import FinanceSettingsCollectionSection from './settings/FinanceSettingsCollectionSection.jsx';
import FinanceSettingsExceptionsSection from './settings/FinanceSettingsExceptionsSection.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { lazyWithRetry } from '../../lib/lazyWithRetry.js';
import RouteFallback from '../shared/RouteFallback.jsx';
import './finance.css';

const ContractTemplatesPage = lazyWithRetry(() => import('../contracts/ContractTemplatesPage'));

const SECTION_META = Object.fromEntries(
  FINANCE_SETTINGS_GROUPS.flatMap((g) => g.items.map((item) => [item.id, item]))
);

/** Minha academia → Financeiro — hub estilo Settings + sub-telas. */
export default function FinanceiroConfigTab({ academyId, isOwner }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = isFinanceSettingsSection(searchParams.get('section'));
  const state = useFinanceConfigState(academyId, { isOwner });
  const accounts = useAccountingStore((s) => s.accounts);

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  const accountsCount = accounts?.length || 0;

  const rescissionTemplates = useMemo(
    () => templatesForPurpose(state.contractTemplates, 'rescission'),
    [state.contractTemplates]
  );

  const goHub = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'financeiro');
        next.delete('section');
        return next;
      },
      { replace: false }
    );
  };

  const goSection = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'financeiro');
        next.set('section', id);
        return next;
      },
      { replace: false }
    );
  };

  const saveBank = (idx, data) => {
    if (idx === 'new') {
      state.setFinanceConfig((prev) => ({
        ...prev,
        bankAccounts: [...(prev.bankAccounts || []), data],
      }));
      return;
    }
    state.updateBankAccount(idx, data);
  };

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar o financeiro.</p>;
  }

  if (state.loading) {
    return <PageSkeleton variant="list" rows={5} />;
  }

  const meta = section ? SECTION_META[section] : null;

  const allNavItems = FINANCE_SETTINGS_GROUPS.flatMap((g) =>
    g.items.filter((item) => !(item.ownerOnly && !isOwner))
  );

  const sectionBody = section ? (
    <>
      {section === FINANCE_SETTINGS_SECTIONS.PLANOS && isOwner ? (
        <FinanceSettingsPlansSection
          financeConfig={state.financeConfig}
          contractTemplates={state.contractTemplates}
          contractTemplatesConfigured={state.contractTemplatesConfigured}
          rescissionTemplates={rescissionTemplates}
          runEnsureContractSetup={state.runEnsureContractSetup}
          ensureContractSetup={state.ensureContractSetup}
          onUpdate={state.updatePlan}
          onAdd={state.addPlan}
          onRemoveRequest={state.setPendingRemovePlan}
        />
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.TAXAS ? (
        <FinanceSettingsFeesSection
          financeConfig={state.financeConfig}
          setFinanceConfig={state.setFinanceConfig}
        />
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.RECEBIMENTO ? (
        <FinanceSettingsBanksSection
          financeConfig={state.financeConfig}
          onSaveBank={saveBank}
          onRemoveRequest={state.setPendingRemoveBank}
        />
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.REGUA && isOwner ? (
        <FinanceSettingsCollectionSection
          collectionRules={state.collectionRules}
          overdueLabel={state.overdueLabel}
          onRulesChange={state.setCollectionRules}
          onOverdueLabelChange={state.setOverdueLabel}
        />
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.EXCECOES ? (
        <FinanceSettingsExceptionsSection
          labels={state.exceptionLabels}
          onChange={state.setExceptionLabels}
        />
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS && isOwner ? (
        <div className="finance-settings-section-body finance-settings-section-body--flush">
          <CaixaAccountingPanel scope="settings" isOwner={isOwner} />
        </div>
      ) : null}

      {section === FINANCE_SETTINGS_SECTIONS.CONTRATOS && isOwner ? (
        <div className="finance-settings-section-body finance-settings-section-body--flush">
          <React.Suspense fallback={<RouteFallback />}>
            <ContractTemplatesPage embedded embeddedFinance />
          </React.Suspense>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <div className={`financeiro-config-tab${state.hasDirty ? ' financeiro-config-tab--dirty' : ''}`}>
      {!section ? (
        <FinanceSettingsHub
          financeConfig={state.financeConfig}
          collectionRules={state.collectionRules}
          accountsCount={accountsCount}
          contractTemplatesCount={(state.contractTemplates || []).length}
          isOwner={isOwner}
          onSelectSection={goSection}
        />
      ) : (
        <div className="finance-settings-layout">
          <nav className="finance-settings-sidenav" aria-label="Seções do financeiro">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`finance-settings-sidenav__item${section === item.id ? ' finance-settings-sidenav__item--active' : ''}`}
                onClick={() => goSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="finance-settings-layout__content">
            <FinanceSettingsDetailHeader title={meta?.label || 'Financeiro'} subtitle={meta?.hint} onBack={goHub} />
            {sectionBody}
          </div>
        </div>
      )}

      <FinanceSettingsStickySave
        visible={state.hasDirty}
        saving={state.saving}
        onSave={state.persistAll}
        onDiscard={state.discardChanges}
      />

      <ConfirmDialog
        open={typeof state.pendingRemovePlan === 'number'}
        title="Remover plano"
        description="Este plano será removido. Alunos vinculados não são afetados, mas novos cadastros não poderão selecioná-lo."
        confirmLabel="Remover"
        confirmVariant="danger"
        onClose={() => state.setPendingRemovePlan(null)}
        onConfirm={() => {
          if (typeof state.pendingRemovePlan !== 'number') return;
          state.removePlan(state.pendingRemovePlan);
          state.setPendingRemovePlan(null);
        }}
      />

      <ConfirmDialog
        open={typeof state.pendingRemoveBank === 'number'}
        title="Remover conta"
        description="Esta conta será removida da lista. Lançamentos existentes não serão alterados."
        confirmLabel="Remover"
        confirmVariant="danger"
        onClose={() => state.setPendingRemoveBank(null)}
        onConfirm={() => {
          if (typeof state.pendingRemoveBank !== 'number') return;
          state.removeBankAccount(state.pendingRemoveBank);
          state.setPendingRemoveBank(null);
        }}
      />
    </div>
  );
}
