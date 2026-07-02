# Validação dos fluxos — 2026-06-23

Validação estática (código + testes Vitest). Checklists manuais em staging ainda pendentes onde indicado.

- 2026-06-23: fluxo de matrícula e financeiro alinhado para desconto individual recorrente em `students.discount_amount`; cálculo líquido propagado para primeira cobrança, mensalidades, inadimplência e card financeiro do perfil.

## Método

| Camada | O que foi feito |
|---|---|
| Código | Conferência de rotas, componentes e handlers citados nos fluxos |
| Testes CRM | `npm test -- enrollmentFlow performEnrollment taskDue taskLinkablePeople inboxConversationState` — **17/17 OK** |
| Testes Financeiro 2A | `npm test -- bankRecon … mensalidades paymentMethods` — **271 passed, 1 skipped** |
| Testes Financeiro 2B | `npm test -- financeSettingsSections financeAccountFormRules … financeTxCategorySelect` — **99 passed** |
| **Financeiro — auditoria salvamento** | `npm test -- mensalidadesPaymentForm financeConfigValidation appwriteErrors financeSettingsSections financeAccountFormRules bankReconciliation` — **151 passed** (2026-06-16) |
| **Formas de recebimento + meios de captura (Fase 2)** | `npm test -- captureMethods resolveAcquirerFees paymentSettlement paymentMethodSettings` — **38 passed** (2026-06-17) |
| Testes Fase 3 | `npm test -- lojaSalesTabs nlAction onboardingChecklist` — **46 passed** |
| Testes Fase 4 | `npm test -- productCatalog lojaInventoryTabs automacoesHub automacoesSetupWizard automationUx` — **40 passed** |
| Testes Conta/assinatura | `npm test -- billingGateClient trialCopy` + `lib/billing/planOrder.test.js` — ver seção Conta |
| Testes Opcionais (Recepção/Relatórios/Equipe) | `bootstrapRoutePrefetch`, `reports*`, `teamPermissions`, `teamMembershipLabel` — **66 passed** |
| Staging | **Pendente** — itens marcados com ⚠️ requerem sessão logada |

## Resumo por fluxo — CRM

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [hoje-dashboard](crm/hoje-dashboard.md) | 17 | 15 | 2 notas | 17 |
| [funil-lead-matricula](crm/funil-lead-matricula.md) | 11 | 10 | 1 nota | 11 |
| [aluno-perfil-presenca](crm/aluno-perfil-presenca.md) | 12 | 10 | 2 corrigidos | 12 |
| [tarefas-operacao](crm/tarefas-operacao.md) | 12 | 12 | 0 | 12 |
| [conversas-inbox](crm/conversas-inbox.md) | 13 | 13 | 0 | 13 |

---

## hoje-dashboard

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Página `/` + hub Experimentais/Catraca | ✅ Código | `Dashboard.jsx`, `HubTabBar`, `recepcaoHubTabs.js` |
| 2 | Hero + 4 KPIs | ✅ Código | `heroStats`: today, enrollments, followup, tasks |
| 3 | KPI matrículas → funil | ✅ Código | `handleKpiClick('enrollments')` → `/reports?tab=funil` |
| 4 | KPI follow-ups → lista | ✅ Código | `scrollToFollowUps`, `#follow-ups` |
| 5 | Lista follow-ups + temperatura | ✅ Código | `followUps`, `FollowupTemperatureBadge`, copy `followupSectionTitle()` |
| 6 | Concluir follow-up (não na agenda) | ✅ Código | `FollowupOutcomeDialog` na lista; compareceu/faltou só em `DashboardAgendaWeekPanel` |
| 7 | WhatsApp follow-up | ✅ Código | `handleFollowUpWhatsApp` |
| 8 | Navegação lead + voltar Recepção | ✅ Código | `LEAD_PROFILE_FROM_DASHBOARD` |
| 9 | Agenda da semana | ✅ Código | `DashboardAgendaWeekPanel`, `FOLLOWUP_AGENDA_MAX_DAYS` |
| 10 | Saúde dos follow-ups | ✅ Código | `FollowupHealthPanel`, `showFollowupHealthPanel` |
| 11 | Tarefas do dia | ⚠️ **Parcial** | KPI navega para `/tarefas?…` — não conclui inline |
| 12 | Aniversários | ✅ Código | `DashboardBirthdayBanner`, `DashboardBirthdayModal` |
| 13 | Aba Catraca + redirects | ✅ Código | `RecepcaoCatracaTab`, `Recepcao.jsx`, `Attendance.jsx` |
| 14 | Aliases `?retornos=1`, `#follow-ups` | ✅ Código | `useEffect` em `Dashboard.jsx` |
| 15 | Troca de academia | ✅ Código | Store `academyId`; ⚠️ validar em staging |
| — | Contagem KPI vs badge follow-up | ⚠️ **Nota** | KPI usa `followUpsNeedingContact`; badge/lista usa `followUps.length` — podem divergir |

**Correções aplicadas (2026-06-17):** fluxo reescrito — hub duas abas, 4 KPIs, terminologia follow-up, diagrama (compareceu/faltou na agenda), contagens documentadas, link para `recepcao-controlid.md`.

---

## funil-lead-matricula

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1–2 | Novo lead + pipeline | ✅ Código | `NewLeadModal`, `Pipeline.jsx` |
| 3 | Kanban ↔ lista | ⚠️ **Desktop only** | Mobile (`≤1023px`) usa lista agrupada; kanban só desktop |
| 3b | Triagem WhatsApp no funil | ✅ Código | Desktop kanban: `InboxTriageCard`; mobile: link **Triar no Inbox** — `leadStageRules.js`, `patchLeadInStore` |
| 3c | Mover para etapa custom | ✅ Código | `buildPipelineMovePayload` + `leadBelongsInPipelineColumn` |
| 4–11 | Demais itens | ✅ Código | `performEnrollment`, export, perfil — testes `enrollmentFlow` passam |
| 7b | WA offline no perfil | ✅ Código | Fases 1–3 + paridade aluno: `ProfileComunicacaoSection`, `ProfileMobileQuickActions` |

**Nota adicionada** no fluxo sobre viewport mobile e triagem (desktop kanban / mobile Inbox).

**Correções aplicadas (2026-06-17):** spec [funil-correcao-definitiva](../superpowers/specs/2026-06-17-funil-correcao-definitiva-PRODUCT.md) — triagem, movimentação custom, store otimista.

---

## aluno-perfil-presenca

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1–6 | Lista, filtros, perfil, edição | ✅ Código | `Alunos.jsx`, `Students.jsx`, `StudentProfile.jsx` |
| 7 | `?view=presenca` | ❌ **Limitação** | `Students` com `embedded` ignora `view=presenca` — rota canônica `/students` usa `Alunos` embutido |
| 7b | Presença alternativa | ✅ Código | Usar **`/recepcao`** (ao vivo + histórico Control iD) |
| 8–12 | Contratos, pagamento, multi-tenant | ✅ Código | `modules.finance`, `canManageStudentPayments` |

**Correções aplicadas:** rota de presença e checklist item 7.

**Gap de produto (não bloqueia doc):** `/presenca` redireciona para `/students?view=presenca`, mas o modo presença não ativa no hub embutido — considerar fix em `Students.jsx` ou tab Presença em `Alunos.jsx`.

---

## tarefas-operacao

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1–12 | Todos | ✅ Código | `Tasks.jsx`, `useTaskStore.uiFilterToApiParams`, limite 500, deep links |

Nenhuma correção necessária na documentação.

---

## conversas-inbox

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1–13 | Todos | ✅ Código | `Inbox.jsx`, filtros `all`/`needs_me`/`unread`, `useInboxUrlState`, handoff |

Harness inbox: módulos em [HARNESS.md](../../HARNESS.md). Teste `inboxConversationState` passa.

---

## Resumo por fluxo — Financeiro (Fase 2A)

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [a-receber-mensalidades](financeiro/a-receber-mensalidades.md) | 18 | 18 | 4 (2026-06-17) | 18 |
| [lancamentos-caixa](financeiro/lancamentos-caixa.md) | 13 | 13 | 1 (2026-06-16) | 13 |
| [conciliacao-bancaria](financeiro/conciliacao-bancaria.md) | 13 | 13 | 1 (2026-06-16) | 13 |
| [fechamento-mensal](financeiro/fechamento-mensal.md) | 13 | 13 | 0 | 13 |

**Permissões hub** (`financeiroHubTabs.js`):

| Aba | member | admin | owner |
|---|---|---|---|
| A receber, Lançamentos, Visão geral | ✅ | ✅ | ✅ |
| Previsão, Conferência do mês | redirect | ✅ | ✅ |
| Conciliação | redirect | redirect | ✅ |

URL `?tab=` fora de `buildFinanceiroAllowedLeafTabs` → redirect em `Caixa.jsx` via `resolveHubTab`.

---

## a-receber-mensalidades

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `/financeiro?tab=a-receber` | ✅ Código | `Caixa.jsx`, `ReceivablesTab` |
| 2 | Sub-abas section | ✅ Código | `financeiroReceivablesSections.js` — visao, mensalidades, cobranca, outros |
| 3 | `section=cobranca` ≠ mensalidades | ✅ Código | Régua de cobrança separada |
| 4–8 | Filtros, modal pagamento, taxas, parcelas | ✅ Código | `MensalidadesPanel`, specs parcelamento/taxas |
| 8b | Cartão com 2+ meios ativos — **Recebido via** obrigatório | ✅ Código + teste | `CaptureMethodSelect`, `validateCaptureMethodForSubmit`, `studentPaymentsHandler` |
| 8c | Cartão com 1 meio — `capture_method_id` auto | ✅ Código | `resolveCaptureFieldsForPayment`, `buildPayload` |
| 8d | Formas inativas ocultas no modal | ✅ Código + teste | `orderedActiveStorageDialectMethodsForModal`, `paymentMethodSettings` |
| 9 | Sem conta bancária — banner + rodapé | ✅ Código | `FinanceBankAccountsSetupBanner`, `PaymentModalFooterHint`, botão desabilitado + `aria-describedby` |
| 10 | Validação por campo no modal | ✅ Código + teste | `validateMensalidadesPaymentForm`, `FieldError`, `PaymentFormErrorBanner` |
| 11 | Erro API (duplicata) no banner | ✅ Código + teste | `studentPaymentFriendlyError` em `appwriteErrors.test.js` |
| 12 | Export CSV | ✅ Código | `exportMensalidadesGridCsv` |
| 13 | Dinheiro: valor recebido insuficiente | ✅ Teste | `mensalidadesPaymentForm.test.js` — `errors.cash_received` |
| 14 | Nova venda plano (LeadCloseSaleModal) | ✅ Código | `NovaVendaPlanPanel` reutiliza mesma validação + `StudentPaymentModal` |
| 15 | Visão geral: banner conta | ✅ Código | `VisaoGeralTab` → `FinanceBankAccountsSetupBanner` |

Harness: `mensalidadesPaymentForm`, `captureMethods`, `appwriteErrors` — ver [auditoria salvamento](#financeiro--auditoria-de-salvamento-2026-06-16).

---

## lancamentos-caixa

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `?tab=movimentacoes` | ✅ Código | `TransacoesTab` |
| 2 | `?new=1` abre modal | ✅ Código | `FINANCEIRO_NOVO_LANCAMENTO_PATH` em `naviMenu.js` |
| 3–11 | CRUD, liquidar, estornar, import, export | ✅ Código | `financeTxApi.js`, harness `finance-lancamentos.md` |
| 12 | Deep link `?tx=` | ✅ Código | `FinanceTxDetailDrawer` |
| 13 | Banner sem conta bancária | ✅ Código | `FinanceBankAccountsSetupBanner` em `TransacoesTab` |

Harness: `financeTx` — testes unitários de payload/validação passam; integração JSX (`financeTxDetailDrawer`) pode falhar por timeout em ambiente lento.

---

## conciliacao-bancaria

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Owner: aba visível | ✅ Código | `buildFinanceiroOwnerLeafTabs` inclui `conciliacao` |
| 2 | Admin/member: redirect | ✅ Código | Só owner em `allowedLeafTabs`; `Caixa.jsx` normaliza URL |
| 3–4 | Import + detalhe | ✅ Código | `ImportStatementModal`, `ReconciliationTab` |
| 4b | Import: hint quando botão desabilitado | ✅ Código | `importDisabledReason` no rodapé de `ImportStatementModal` |
| 5–7 | Confirmar / confirmar todos / manual | ✅ Código | `confirmBankMatch`, `confirmAllBankMatches`, `manualReconcileTx` |
| 8–9 | Erros `tx_not_settled`, mismatch | ✅ Código | `RECON_ERROR_MESSAGES` em `ReconciliationTab.jsx` |
| 10–11 | Ignorar órfão + completar | ✅ Código | `ignoreBankItem`, `completeBankReconciliation` |
| 12 | Multi-tenant | ✅ Código | `academyId` em todas as chamadas API |

Harness: `bankRecon`, `bankReconciliationMatcher`, `bankReconciliationValidation`.

---

## fechamento-mensal

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `?tab=fechamento` | ✅ Código | `MonthlyClosingTab` |
| 2 | Member redirect | ✅ Código | `FINANCEIRO_MEMBER_RESTRICTED_TABS` + `allowedLeafTabs` |
| 3–7 | Mês, regime, filtros, busca, totais | ✅ Código | `monthlyClosing.js`, `filterClosingRows` |
| 8 | Export CSV | ✅ Código | `exportClosingCsv` |
| 9 | Lançamento manual | ✅ Código | `createFinanceTx` na toolbar |
| 10–11 | Registrar conferência | ✅ Código | `recordCashClosing`, `ConfirmDialog` |
| 12 | `snapshot_mismatch` | ✅ Código | Handler em `MonthlyClosingTab` linha ~410 |
| 13 | Evento pós-fechamento | ✅ Código | `CASH_CLOSING_UPDATED_EVENT` |

Harness: `monthlyClosing`, `financeClosingData`.

**Alias legado:** `?tab=closing` → `fechamento` via `financeiroLegacyTabToSlug`.

---

## Resumo por fluxo — Financeiro (Fase 2B)

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [config-inicial-financeiro](financeiro/config-inicial-financeiro.md) | 16 owner + 5 admin | 21 | 5 (2026-06-17) | 21 |
| [plano-contas-categorias](financeiro/plano-contas-categorias.md) | 12 | 12 | 0 | 12 |

**Permissões Empresa → Financeiro** (`financeSettingsSections.js`):

| Seção | owner | admin |
|---|---|---|
| Planos, Régua, Contratos, Plano de contas, Razão | ✅ | oculta / redirect |
| Recebimento, **Formas de recebimento**, Taxas, WhatsApp, Exceções | ✅ | ✅ |

`canAccessEmpresaFinanceSettings`: owner e admin; member bloqueado em `AcademySettings.jsx`.

---

## config-inicial-financeiro

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Acesso owner/admin à aba | ✅ Código | `canAccessEmpresaFinanceSettings`, `getTabDisabledState` |
| 2 | Member bloqueado | ✅ Código | Tab disabled + tooltip |
| 3 | Default section owner = planos | ✅ Código | `getFinanceDefaultSection(true)` |
| 4 | Default section admin = recebimento | ✅ Código | `getFinanceDefaultSection(false)` |
| 5 | Sidebar admin sem owner-only | ✅ Código | `buildFinanceSettingsNavItems(false)` — teste Vitest |
| 6 | Deep link planos → redirect admin | ✅ Código | `activeSection` fallback em `FinanceiroConfigTab` |
| 7 | Planos CRUD + ConfirmDialog remover | ✅ Código | `FinanceSettingsPlansSection`, `useFinanceConfigState` |
| 8 | Recebimento modal + defaults por método | ✅ Código | `FinanceSettingsBanksSection`, `#contas` |
| 8b | **Formas de recebimento** — ativar forma, conta, automações, preview | ✅ Código | `FinanceSettingsPaymentMethodsSection`, `FinancePaymentMethodPreview` |
| 8c | **Meios de captura** (crédito/débito) — CRUD, matriz taxas/prazos | ✅ Código + teste | `FinanceSettingsCaptureMethodPanel`, `captureMethods.test.js` |
| 8d | `captureMethods` no dirty/save | ✅ Código | `digestCaptureMethods` em `useFinanceConfigState` |
| 9 | Taxas percentuais | ✅ Código | `FinanceSettingsFeesSection`, `feesConfigured` |
| 10 | Sticky save salvar/descartar | ✅ Código | `FinanceSettingsStickySave`, `hasDirty`, `persistAll` |
| 10b | Sticky save: validação antes de persistir | ✅ Código + teste | `validateFinanceConfigBeforeSave`, `saveValidationHint` |
| 10c | Link «Ir para seção» no sticky save | ✅ Código | `saveValidationSection` + `onGoToIssueSection` em `FinanceiroConfigTab` |
| 11 | Recebimento: conta incompleta no modal | ✅ Código + teste | `isUsableBankAccount` em `FinanceSettingsBanksSection`; `financeConfigValidation.test.js` |
| 12 | Onboarding setup_finance | ✅ Código | `onboardingChecklist.js` → `/empresa?tab=financeiro` |
| 13 | Progress summaries | ✅ Código | `financeSettingsProgress` — owner 4 / admin 2 |

Harness: `financeSettingsSections`, `financeConfigValidation`, `captureMethods`, `resolveAcquirerFees` — ver [auditoria salvamento](#financeiro--auditoria-de-salvamento-2026-06-16).

---

## plano-contas-categorias

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `section=plano-contas` owner | ✅ Código | `CaixaAccountingPanel`, `AccountsTab` |
| 2 | Admin sem seção | ✅ Código | `ownerOnly` em `FINANCE_SETTINGS_GROUPS` |
| 3 | Drawer validação inline | ✅ Código | `FieldError` em `AccountsTab.jsx` |
| 4 | Herança subconta | ✅ Código | `financeAccountFormRules.test.js` |
| 5 | Dedup categorias lançamento | ✅ Código | `financeCategories.test.js`, `financeTxCategorySelect` |
| 6 | Default saída Outras despesas | ✅ Código | `defaultCategoryForDirection` |
| 7 | Import/export planilha | ✅ Código | `ImportFinanceModal`, `exportAccountsCsv` |
| 8 | Razão embedded | ✅ Código | `JournalTab` em `section=razao-contabil` |
| 9 | Deep link `from=tx&txId` | ✅ Código | `linkedTxId` em `FinanceiroConfigTab` |
| 10 | Extrato hub → empresa | ✅ Código | `FINANCEIRO_EXTRATO_TAB` redirect |
| 11–12 | Multi-tenant + automação mensalidade | ✅ Código | `academyId` em queries; harness manual QA |

Harness: ver [finance-plano-contas.md](../../harness/finance-plano-contas.md).

---

## Resumo por fluxo — Fase 3

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [pdv-nova-venda](vendas/pdv-nova-venda.md) | 14 | 14 | 0 | 14 |
| [onboarding-academia](config/onboarding-academia.md) | 12 | 12 | 0 | 12 |

---

## pdv-nova-venda

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Hub `/loja?tab=vendas` | ✅ Código | `Loja.jsx`, `Sales.jsx` |
| 2 | Normalização `subtab` | ✅ Código | `lojaSalesTabs.js`, testes Vitest |
| 3 | `createSale` checkout | ✅ Código | `SalesNewSaleTab`, `useSalesStore` |
| 4 | Erros estoque | ✅ Código | `no_stock`, `stock_stale` |
| 5 | Modo PDV `?pdv=1` | ✅ Código | `resolveSalesPdvMode`, `readSalesPdvPreference` |
| 6 | Modal Nova venda | ✅ Código | `NovaVendaModal`, `NOVA_VENDA_MENU_ACTION` |
| 7 | Histórico + filtros | ✅ Código | `SalesHistoryTab` |
| 8 | Cancelar owner/admin | ✅ Código | `canCancelSale` em `SalesHistoryTab` |
| 9 | Legacy redirects | ✅ Código | `App.jsx` `/vendas` → Loja |
| 10–14 | Pagamento, a prazo, multi-tenant | ✅ Código | `salePayments.js`, `academyId` |

Harness: `lojaSalesTabs` (7 testes), `nlAction` (`register_sale`).

---

## onboarding-academia

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Banner condicional | ✅ Código | `OnboardingBanner`, `showBanner` |
| 2 | Core por módulos | ✅ Código | `buildEffectiveCoreSteps` |
| 3 | Auto-done finance/produto/estoque | ✅ Código | `OnboardingBanner` useEffect + `computedDone` |
| 4 | Dismiss localStorage | ✅ Código | `onboardingDismissStorageKey` |
| 5 | Member bloqueado IA/WhatsApp | ✅ Código | `stepBlocked`, `canConfigureAgenteIa` |
| 6 | Rotas lead, IA, finance, tax, loja | ✅ Código | `onboardingStepPath` |
| 7 | `first_product` → produtos | ✅ Código | `onboardingStepPath('first_product')` |
| 8 | `first_stock_entry` → estoque | ✅ Código | `onboardingStepPath('first_stock_entry')` |
| 9 | `setup_automations` fora do core | ✅ Código | Não está em `buildEffectiveCoreSteps` ids |
| 10 | `install_pwa` secundário | ✅ Código | `SECONDARY_ONBOARDING_IDS` |
| 11–12 | Trial line, multi-tenant | ✅ Código | `trialDaysRemaining`, `academyId` |

Harness: `onboardingChecklist` (`onboardingStepPath`).

---

## Resumo por fluxo — Fase 4

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [produtos-catalogo](vendas/produtos-catalogo.md) | 12 | 12 | 0 | 12 |
| [estoque-movimentacoes](vendas/estoque-movimentacoes.md) | 12 | 12 | 0 | 12 |
| [agente-ia-whatsapp](atendimento/agente-ia-whatsapp.md) | 19 | 19 | 0 | 19 |
| [automacoes-funil](atendimento/automacoes-funil.md) | 12 | 12 | 0 | 12 |

---

## produtos-catalogo

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `?tab=produtos` no hub Loja | ✅ Código | `Loja.jsx`, `Products.jsx` |
| 2 | `canAccess` sales ou inventory | ✅ Código | `modules.sales \|\| modules.inventory` |
| 3 | CRUD + variantes | ✅ Código | `ProductFormModal`, `useProductsStore` |
| 4 | Deep links edit/duplicate | ✅ Código | `searchParams` effect |
| 5 | Import `?import=1` | ✅ Código | abre modal e remove query |
| 6 | Dedup variantes | ✅ Código | `productCatalog.test.js` |
| 7 | Legacy `/produtos` | ✅ Código | `App.jsx` `LojaTabRedirect` |
| 8–12 | Filtros, delete com vendas, multi-tenant | ✅ Código | `filterParentCatalog`, `checkDeleteProduct` |

Harness: `productCatalog`, `productCatalogDb`.

---

## estoque-movimentacoes

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `?tab=estoque` requer inventory | ✅ Código | `modules.inventory`, `Inventory.jsx` |
| 2 | Subtabs saldo/movimentos | ✅ Código | `lojaInventoryTabs.js` — testes Vitest |
| 3 | Entrada / ajuste / conferência | ✅ Código | modais + `useInventoryStore` |
| 4 | Entrada + financeiro | ✅ Código | toast `financial_tx_id` |
| 5 | Link import → produtos | ✅ Código | `/loja?tab=produtos&import=1` |
| 6 | `?item=` highlight | ✅ Código | `highlightItemId` |
| 7–12 | sync pós-venda, onboarding, legacy `/estoque` | ✅ Código | `refreshStockStores`, redirects |

Harness: `lojaInventoryTabs`.

---

## agente-ia-whatsapp

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `/agente-ia` owner/member | ✅ Código | `canViewAgentSettings` |
| 2 | Admin bloqueado | ✅ Código | `role === 'admin'` → mensagem permissão |
| 3 | Setup 2 passos (Agente) + 3 passos (Integrações) | ✅ Código | `AgenteIASection`, `WhatsAppSetupStepper` |
| 4 | Zapster QR/status em Integrações | ✅ Código | `WhatsAppConnectionPanel`, `useZapsterWhatsAppConnection` |
| 5 | Recursos de IA (setting-row) | ✅ Código | `agent-ia-setting-row`, `handleToggleAiModule` |
| 6 | Editar prompt | ✅ Código | `canEditAgentPrompt` |
| 7 | Ativar via botão (sem toggle header) | ✅ Código | `renderServiceControl`, `handleToggleIa(true)` |
| 8 | Pausar via botão outline | ✅ Código | `renderServiceControl`, `handleToggleIa(false)` |
| 9 | Guards ativar (IA off / WA off) | ✅ Código | `renderServiceControl` disabled + hints |
| 10 | Legacy `?tab=agente` | ✅ Código | `Automacoes.jsx` navigate |
| 11–19 | Billing, inbox, confirmações, header chip, IA off, handoff Integrações, sidebar Conectar WA | ✅ Código | `WhatsAppConnectionPanel`, `buildConectarWhatsAppNavItem`, `OnboardingBanner` |

Harness: `npm test -- waSetupProgress agentIaRoutes naviMenu onboardingChecklist`.

**Spec UX:** [2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md](../superpowers/specs/2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md) — P0–P2 concluídos 2026-06-17.

---

## automacoes-funil

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Hub 3 abas | ✅ Código | `AUTOMACOES_TABS` |
| 2 | Processos ≠ envio WA | ✅ Código | `AUTOMACOES_TAB_HINTS` |
| 3 | Modelos + customize | ✅ Código | `areTemplatesCustomized` |
| 4 | Config toggles | ✅ Código | `parseAutomationsConfig`, `AutomacoesSection` |
| 5 | Wizard setup | ✅ Código | `automacoesSetupWizard.js` |
| 6 | Config dirty guard | ✅ Código | `Automacoes.jsx` `leaveConfirmOpen` |
| 7 | `canEditWhatsappTemplates` | ✅ Código | owner/admin team |
| 8–12 | Readiness WA, wizard dismiss, multi-tenant | ✅ Código | `computeAutomationReadiness` |

Harness: `automacoesHub`, `automacoesSetupWizard`, `automationUx`.

### Auditoria de campos — audiência v3 (GBLP, 2026-06-17)

Script: `npm run audit:audience-fields-gblp` → `scripts/audit-audience-fields-gblp.mjs`

Academia GBLP (`699f21b70006985daa90`) · 76 alunos ativos (`student_status != inactive`)

| campo | preenchidos | % | decisão UI |
|---|---|---|---|
| `type` | 76/76 | 100% | ✅ exibir filtro |
| `plan` | 69/76 | 90,8% | ✅ exibir filtro |
| `turma` | 70/76 | 92,1% | ✅ exibir filtro |
| `enrollmentDate` | 76/76 | 100% | ✅ exibir filtro tenure |

**Valores distintos:**

- `type`: Adulto (42), Criança (30), Juniores (4)
- `plan`: Anual adulto (25), Recorrente Adulto (7), Recorrente Infantil (7), Mensal Infantil (5), Mensal (5), Anual infantil (4), Recorrente (3), Recorrente Promocional (3), Anual (3), Mensal Adulto (3), Recorrente Família (2), Mensal (Promocional) (1), Diária (1)
- `turma`: Adultos (37), Kids (27), Juniores (6)
- `enrollmentDate`: 100% preenchido; `converted_at` também 76/76 (fallback tenure não necessário nesta academia)

**Inconsistências:** nenhuma variação de capitalização/accent no mesmo valor normalizado. Observação de qualidade (não bloqueante): nomes de plano misturam grafias (`Anual adulto` vs `Anual infantil` vs `Anual`); turma usa `Kids` enquanto `type` usa `Criança` — normalização futura opcional, não corrigido nesta auditoria.

**Harness audiência:** `npm test -- automationAudience` — **41 passed**. Implementação v4: UI audiência + cron retenção + `automation_logs` (`npm run provision:automation-logs`).

---

## Resumo por fluxo — Conta

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [conta-assinatura](config/conta-assinatura.md) | 14 owner + 3 não-owner | 17 | 0 | 17 |

---

## conta-assinatura

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `/conta` tabs perfil/assinatura/dados | ✅ Código | `UserAccount`, `ACCOUNT_TABS` |
| 2 | Legacy `seguranca` → perfil | ✅ Código | `useEffect` redirect |
| 3 | Legacy `/profile`, `/planos` | ✅ Código | `legacyRedirects.test.jsx` |
| 4 | Planos Nave PLAN_CONFIG | ✅ Código | `planConfig.js` ≠ `academyPlans` |
| 5 | Checkout owner-only API | ✅ Código | `assertAcademyOwnedByOwner` em `api/billing.js` |
| 6 | Upgrade/downgrade | ✅ Código | `planOrder.test.js`, `postChangePlan` |
| 7 | Billing gate cliente | ✅ Código | `billingGateClient.test.js` |
| 8 | Preview sem VITE_BILLING | ✅ Código | `isBillingLive()`, status `preview` |
| 9 | Trial chip topbar | ✅ Código | `App.jsx` → `?tab=assinatura` |
| 10–14 | Cancel, faturas, CPF alert, senha | ✅ Código | componentes `billing/*` |

Harness: `billingGateClient`, `trialCopy`, `lib/billing/planOrder.test.js`.

---

## Resumo por fluxo — Opcionais (Recepção, Relatórios, Equipe)

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [recepcao-controlid](crm/recepcao-controlid.md) | 20 | 20 | 0 | 20 |
| [relatorios-indicadores](analise/relatorios-indicadores.md) | 13 | 13 | 0 | 13 |
| [equipe-colaboradores](config/equipe-colaboradores.md) | 11 | 11 | 0 | 11 |

---

## recepcao-controlid

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Rota `/recepcao` | ✅ Código | `App.jsx`, `Recepcao.jsx` |
| 2 | Abas ao-vivo / historico | ✅ Código | `searchParams.tab` |
| 3 | Setup em Integrações | ✅ Código | `Integracoes.jsx`, `ControlIdCatracaSection` |
| 4 | Status via API | ✅ Código | `useAcademyControlId`, `/api/control-id/status` |
| 5 | Poll monitor | ✅ Código | `RecepcaoLivePanel`, `pollControlIdMonitor` |
| 6 | Liberar catraca | ✅ Código | `releaseControlIdGate` |
| 7 | Feed entradas hoje | ✅ Código | `fetchControlIdAttendance` |
| 8 | Histórico filtros | ✅ Código | `ControlIdAttendancePanel`, `DATE_RANGES` |
| 9 | Sync todos alunos | ✅ Código | `syncAllControlId` |
| 10 | Presença server-side | ✅ Código | `controlidHandlers.processAccessEvent` |
| 11 | Bootstrap alunos | ✅ Código | `bootstrapRoutePrefetch.test.js` |
| 12 | Link modo recepção | ✅ Código | `ControlIdAttendancePanel` → `/recepcao` |
| 13 | F1 relay + last_sync | ✅ Código | `ControlIdCatracaSection`, `touchControlIdLastSync` |
| 14 | F2 justificativa release | ✅ Código | `ControlIdReleaseDialog`, `controlidRelease.js` |
| 15 | F3 cooldown | ✅ Código | `controlidCooldown.js`, feed `ignored` |
| 16 | F4 bloqueio inadimplente | ✅ Código | `controlidOverdueAccess.js`, sync skip |
| 17 | P0/P1 integração | ✅ Código | sync skip overdue, `ensureAcademyAccess` release |
| 18 | P2 UX config + badge | ✅ Código | seções Integrações, `controlIdSyncBadgeMeta` |
| 19 | Spec PRODUCT/TECH | ✅ Doc | `2026-06-17-catraca-gaps-prioridade-alta-*.md` |
| 20 | QA hardware + relay | ⚠️ Staging | Revogar/re-sync inadimplente no equipamento |

Nota UX: links de config apontam para `/integracoes?tab=catraca`. Spec: [catraca gaps PRODUCT](../superpowers/specs/2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md).

---

## relatorios-indicadores

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `/reports` hub | ✅ Código | `Reports.jsx`, `HubTabBar` |
| 2 | Abas por módulo | ✅ Código | `getReportTabItems` |
| 3 | Default funil | ✅ Código | `getDefaultReportTab` |
| 4 | Aliases tab legados | ✅ Código | `normalizeReportTabParam` — testes |
| 5 | POST funnel/students | ✅ Código | `api/reports.js` |
| 6 | Período toolbar | ✅ Código | `useReportsPeriod` |
| 7 | Drill dialog | ✅ Código | `ReportsDrillDialog` |
| 8 | Export CSV | ✅ Código | `useReportsLeadExport`, `reportsExport.test.js` |
| 9 | KPI metas RAG | ✅ Código | `reportsKpiGoals` |
| 10 | Painéis lazy fin/loja/estoque | ✅ Código | `ReportsTabPanels` |
| 11 | Filtro operador loja | ✅ Código | `fetchTeamMemberships` em `Reports.jsx` |
| 12 | Multi-tenant API | ✅ Código | `bodyAcademyId` vs token — 403 |
| 13 | Menu sidebar | ✅ Código | `buildRelatoriosNavItem` |

Harness: `reports.test.js`, `reportsExport.test.js`, `reportsFinanceParity.test.js`, `reportsPeople.test.js`.

---

## equipe-colaboradores

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Rota `/equipe` | ✅ Código | `App.jsx`, `Equipe.jsx` |
| 2 | Menu usuário | ✅ Código | `NaviUserMenu.jsx` |
| 3 | Convite membro | ✅ Código | `createTeamMember`, `EquipeSection` |
| 4 | Matriz permissões | ✅ Código | `teamPermissions.js` — 7 testes |
| 5 | Owner convida admin | ✅ Código | `canAddTeamMember` |
| 6 | Admin só recepcionista | ✅ Código | `roleOptionsForAdd` |
| 7 | Editar / remover | ✅ Código | `updateTeamMember`, `removeTeamMember` |
| 8 | Reset senha | ✅ Código | `resetTeamMemberPassword` |
| 9 | Auditoria owner | ✅ Código | `fetchTeamAuditEvents` |
| 10 | Recepcionista read-only | ✅ Código | `!canManage` banner |
| 11 | Legacy redirect | ✅ Código | `empresaLegacyRedirects.js` |

Harness: `teamPermissions.test.js`, `teamMembershipLabel.test.js`.

---

## empresa-horarios-turmas

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Rota `/empresa?tab=horarios` | ✅ Código | `AcademySettings.jsx`, `TABS_ALL` |
| 2 | Owner-only aba Horários | ✅ Código | `getTabDisabledState` |
| 3 | CRUD turmas | ✅ Código | `ClassesSection`, `classesStore.js` |
| 4 | Guard delete turma c/ horários | ✅ Código | `deleteClass` → `class_has_schedules` |
| 5 | CRUD horários + `class_id` | ✅ Código | `SchedulesSection`, `schedulesStore.js` |
| 6 | Bloqueio sem turmas ativas | ✅ Código | `SchedulesSection` empty/disabled |
| 7 | Redirect Empresa → Alunos | ✅ Código | `ClassesTurmasRedirectSection.jsx` |
| 8 | Labels canônicos | ✅ Código | `resolveAcademyTurmaLabels`, `useAcademyTurmas.js` |
| 9 | Matrícula pública | ✅ Código | `publicEnrollmentHandler.js`, `buildPublicEnrollmentFormConfig` |
| 10 | Automações audiência turma | ✅ Código | `AutomationAudienceSection` + hook |
| 11 | Recepção grade semanal | ✅ Código | `RecepcaoSchedulesGrid.jsx`, `ScheduleGridCard.jsx` |
| 11b | Recepção aulas de hoje | ✅ Código | `RecepcaoTodaySlotsSection.jsx` montado em `Dashboard.jsx` |
| 12 | Provision schema | ✅ Código | `provision-booking-schema.mjs` |
| 13 | Migração legado | ✅ Código | `migrate-academy-turmas-to-classes.mjs` |

Harness: `classes.test.js`, `classesStore.test.js`, `schedules.test.js`, `schedulesStore.test.js`, `recepcaoScheduleGrid.test.js`, `academyTurmas.test.js`.

---

## Financeiro — auditoria de salvamento (2026-06-16)

Correções das sprints 1–3 + P0/P1 (validação por campo, banners de conta, sticky save, componentes compartilhados de feedback).

### Harness automatizado

```bash
npm test -- mensalidadesPaymentForm financeConfigValidation appwriteErrors financeSettingsSections financeAccountFormRules bankReconciliation
```

**Resultado:** 151 passed (2026-06-16).

### Matriz de cenários (salvamento)

| # | Cenário | Código | Teste auto | Staging |
|---|---|---|---|---|
| 1 | Academia **sem** conta → mensalidade | ✅ Banner + rodapé + botão desabilitado | ✅ `errors.account` | ⚠️ Pendente |
| 2 | Conta OK → PIX completo | ✅ `createPayment` | — | ⚠️ Pendente |
| 3 | Valor zero | ✅ `FieldError` / validação | ✅ `errors.amount` | ⚠️ Pendente |
| 4 | Dinheiro: recebido &lt; valor | ✅ `FieldError` cash_received | ✅ `errors.cash_received` | ⚠️ Pendente |
| 5 | Duplicata valor+data | ✅ `PaymentFormErrorBanner` | ✅ `studentPaymentFriendlyError` | ⚠️ Pendente |
| 6 | Plano de contas sem grupo DRE | ✅ `validateAccountForm` | ✅ `financeAccountFormRules` | ⚠️ Pendente |
| 7 | Saída como recepcionista | ✅ handler API | — | ⚠️ Pendente |
| 8 | Config: plano sem nome | ✅ bloqueio sticky save | ✅ `financeConfigValidation` | ⚠️ Pendente |
| 9 | Banco só com agência | ✅ `FieldError` no modal | ✅ conta incompleta em `validateFinanceConfigBeforeSave` | ⚠️ Pendente |
| 10 | Import extrato sem conta | ✅ `importDisabledReason` | — | ⚠️ Pendente |

### Componentes compartilhados (novos)

| Componente | Uso |
|---|---|
| `PaymentFormErrorBanner` | Erro persistente de API/submit em modais de pagamento |
| `PaymentModalFooterHint` | Hint no rodapé quando submit desabilitado |
| `FinanceBankAccountsSetupBanner` | Pré-requisito conta bancária (Mensalidades, Caixa, Visão geral) |

### Sprint 4 — perfil, fechamento manual, grade (2026-06-16)

| Fluxo | Melhoria |
|---|---|
| `StudentProfile` → pagamento | `validateMensalidadesPaymentForm`, `fieldErrors`, `PaymentFormErrorBanner`, `requireBankAccountForSave` |
| `MonthlyClosingTab` | `validateClosingManualReceiptForm`, `FieldError`, `BankAccountSelect`, `bank_account` no payload |
| `PaymentStatusPopover` / grade | Validação inline + `studentPaymentFriendlyError` no save |

Harness: `npm test -- mensalidadesPaymentForm financeConfigValidation monthlyClosing paymentStatus appwriteErrors`

---

## Próximo passo

1. Executar a [matriz de salvamento](#matriz-de-cenários-salvamento) em **staging** com academia demo.
2. Abrir issue para presença em `/students?view=presenca` via hub embutido (se prioritário).
3. ~~Corrigir link de config na recepção~~ — feito (`/integracoes?tab=catraca`).
