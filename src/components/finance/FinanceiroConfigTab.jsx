import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { templatesForPurpose } from '../../lib/contractPlanTemplates.js';
import {
  FINANCE_SETTINGS_SECTIONS,
  getFinanceDefaultSection,
  isFinanceSettingsSection,
  FINANCE_SETTINGS_GROUPS,
  buildFinanceSettingsNavItems,
  financeSettingsSectionLabel,
} from '../../lib/financeSettingsSections.js';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import { useFinanceConfigState } from '../../hooks/useFinanceConfigState.js';
import { useAccountingStore } from '../../store/useAccountingStore';
import CaixaAccountingPanel from './CaixaAccountingPanel.jsx';
import JournalTab from './JournalTab.jsx';
import AcademyTabSettingsLayout from '../academy/settings/AcademyTabSettingsLayout.jsx';
import FinanceSettingsStickySave from './settings/FinanceSettingsStickySave.jsx';
import FinanceSettingsPlansSection from './settings/FinanceSettingsPlansSection.jsx';
import FinanceSettingsFeesSection from './settings/FinanceSettingsFeesSection.jsx';
import FinanceSettingsBanksSection from './settings/FinanceSettingsBanksSection.jsx';
import FinanceSettingsVendorsSection from './settings/FinanceSettingsVendorsSection.jsx';
import { normalizeBankAccountEntry } from '../../lib/bankAccounts.js';
import { parseCurrencyBRL } from '../../lib/masks.js';
import FinanceSettingsCollectionSection from './settings/FinanceSettingsCollectionSection.jsx';
import FinanceSettingsWhatsappRemindersSection from './settings/FinanceSettingsWhatsappRemindersSection.jsx';
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

/** Minha academia → Financeiro — sidebar + subpáginas (mesmo layout das demais abas). */
export default function FinanceiroConfigTab({ academyId, isOwner }) {
  const [searchParams] = useSearchParams();
  const defaultSection = useMemo(() => getFinanceDefaultSection(isOwner), [isOwner]);
  const state = useFinanceConfigState(academyId, { isOwner });
  const { section, goSection } = useAcademyTabSection(
    'financeiro',
    defaultSection,
    isFinanceSettingsSection
  );

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  const accounts = useAccountingStore((s) => s.accounts);
  const journal = useAccountingStore((s) => s.journal);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const addEntry = useAccountingStore((s) => s.addEntry);
  const deleteEntry = useAccountingStore((s) => s.deleteEntry);

  const linkedTxId =
    searchParams.get('from') === 'tx' ? String(searchParams.get('txId') || '').trim() : '';

  const rescissionTemplates = useMemo(
    () => templatesForPurpose(state.contractTemplates, 'rescission'),
    [state.contractTemplates]
  );

  const allNavItems = useMemo(() => buildFinanceSettingsNavItems(isOwner), [isOwner]);

  const activeSection = useMemo(() => {
    if (allNavItems.some((item) => item.id === section)) return section;
    return allNavItems[0]?.id || defaultSection;
  }, [allNavItems, section, defaultSection]);

  useEffect(() => {
    if (section !== activeSection) {
      goSection(activeSection);
    }
  }, [section, activeSection, goSection]);

  const saveBank = (idx, data) => {
    const openingRaw = data.openingBalance;
    const openingParsed =
      typeof openingRaw === 'number'
        ? openingRaw
        : parseCurrencyBRL(String(openingRaw ?? ''));
    const normalized = normalizeBankAccountEntry({
      ...data,
      openingBalance: Number.isFinite(openingParsed) ? openingParsed : 0,
    });
    if (idx === 'new') {
      state.setFinanceConfig((prev) => ({
        ...prev,
        bankAccounts: [...(prev.bankAccounts || []), normalized],
      }));
      return;
    }
    state.updateBankAccount(idx, normalized);
  };

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia para configurar o financeiro.</p>;
  }

  if (state.loading) {
    return <PageSkeleton variant="list" rows={5} />;
  }

  const meta = SECTION_META[activeSection] || null;

  const sectionBody = activeSection ? (
    <>
      {activeSection === FINANCE_SETTINGS_SECTIONS.PLANOS && isOwner ? (
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

      {activeSection === FINANCE_SETTINGS_SECTIONS.TAXAS ? (
        <FinanceSettingsFeesSection
          financeConfig={state.financeConfig}
          setFinanceConfig={state.setFinanceConfig}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.RECEBIMENTO ? (
        <FinanceSettingsBanksSection
          financeConfig={state.financeConfig}
          setFinanceConfig={state.setFinanceConfig}
          onSaveBank={saveBank}
          onRemoveRequest={state.setPendingRemoveBank}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.FORNECEDORES && isOwner ? (
        <FinanceSettingsVendorsSection
          financeConfig={state.financeConfig}
          onUpdate={state.updateVendor}
          onAdd={state.addVendor}
          onRemoveRequest={state.setPendingRemoveVendor}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.REGUA && isOwner ? (
        <FinanceSettingsCollectionSection
          collectionRules={state.collectionRules}
          onRulesChange={state.setCollectionRules}
          overdueLabel={state.overdueLabel}
          onOverdueLabelChange={state.setOverdueLabel}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.WHATSAPP ? (
        <FinanceSettingsWhatsappRemindersSection
          financeConfig={state.financeConfig}
          setFinanceConfig={state.setFinanceConfig}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.EXCECOES ? (
        <FinanceSettingsExceptionsSection
          labels={state.exceptionLabels}
          onChange={state.setExceptionLabels}
        />
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS && isOwner ? (
        <div className="finance-settings-section-body finance-settings-section-body--flush">
          <CaixaAccountingPanel isOwner={isOwner} />
        </div>
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.RAZAO && isOwner ? (
        <div className="finance-settings-section-body finance-settings-section-body--flush">
          <JournalTab
            academyId={academyId}
            accounts={accounts}
            journal={journal}
            setJournal={setJournal}
            addEntry={addEntry}
            deleteEntry={deleteEntry}
            sectionTitle="Razão contábil"
            embedded
            linkedTxId={linkedTxId}
          />
        </div>
      ) : null}

      {activeSection === FINANCE_SETTINGS_SECTIONS.CONTRATOS && isOwner ? (
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
      <AcademyTabSettingsLayout
        navLabel="Seções do financeiro"
        items={allNavItems}
        activeId={activeSection}
        onSelect={goSection}
        title={meta?.label || 'Financeiro'}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>

      <FinanceSettingsStickySave
        visible={state.hasDirty}
        saving={state.saving}
        onSave={state.persistAll}
        onDiscard={state.discardChanges}
        saveHint={state.saveValidationHint}
        saveIssueSectionId={state.saveValidationSection}
        saveIssueSectionLabel={
          state.saveValidationSection
            ? financeSettingsSectionLabel(state.saveValidationSection)
            : ''
        }
        onGoToIssueSection={goSection}
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

      <ConfirmDialog
        open={typeof state.pendingRemoveVendor === 'number'}
        title="Remover fornecedor"
        description="O fornecedor será removido da lista. Contas já registradas não serão alteradas."
        confirmLabel="Remover"
        confirmVariant="danger"
        onClose={() => state.setPendingRemoveVendor(null)}
        onConfirm={() => {
          if (typeof state.pendingRemoveVendor !== 'number') return;
          state.removeVendor(state.pendingRemoveVendor);
          state.setPendingRemoveVendor(null);
        }}
      />
    </div>
  );
}
