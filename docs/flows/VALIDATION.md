# Validação dos fluxos — 2026-06-15

Validação estática (código + testes Vitest). Checklists manuais em staging ainda pendentes onde indicado.

## Método

| Camada | O que foi feito |
|---|---|
| Código | Conferência de rotas, componentes e handlers citados nos fluxos |
| Testes CRM | `npm test -- enrollmentFlow performEnrollment taskDue taskLinkablePeople inboxConversationState` — **17/17 OK** |
| Testes Financeiro 2A | `npm test -- bankRecon … mensalidades paymentMethods` — **271 passed, 1 skipped** |
| Testes Financeiro 2B | `npm test -- financeSettingsSections financeAccountFormRules … financeTxCategorySelect` — **99 passed** |
| Testes Fase 3 | `npm test -- lojaSalesTabs nlAction onboardingChecklist` — **46 passed** |
| Testes Fase 4 | `npm test -- productCatalog lojaInventoryTabs automacoesHub automacoesSetupWizard automationUx` — **40 passed** |
| Testes Conta/assinatura | `npm test -- billingGateClient trialCopy` + `lib/billing/planOrder.test.js` — ver seção Conta |
| Staging | **Pendente** — itens marcados com ⚠️ requerem sessão logada |

## Resumo por fluxo — CRM

| Fluxo | Itens checklist | OK (código) | Ajustes doc | Staging pendente |
|---|---|---|---|---|
| [hoje-dashboard](crm/hoje-dashboard.md) | 11 | 9 | 2 corrigidos | 11 |
| [funil-lead-matricula](crm/funil-lead-matricula.md) | 11 | 10 | 1 nota | 11 |
| [aluno-perfil-presenca](crm/aluno-perfil-presenca.md) | 12 | 10 | 2 corrigidos | 12 |
| [tarefas-operacao](crm/tarefas-operacao.md) | 12 | 12 | 0 | 12 |
| [conversas-inbox](crm/conversas-inbox.md) | 13 | 13 | 0 | 13 |

---

## hoje-dashboard

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Página `/` carrega | ✅ Código | `Dashboard.jsx`, rota em `App.jsx` |
| 2 | Hero + KPIs | ✅ Código | `heroStats`, `buildHeroDateLine` |
| 3 | Lista retornos + temperatura | ✅ Código | `followUps`, `FollowupTemperatureBadge` |
| 4 | ~~Compareceu/Faltou em retornos~~ | ❌ **Doc incorreta** | Retornos usam **Concluir retorno** → `FollowupOutcomeDialog`. Compareceu/Faltou ficam na **Agenda da semana** |
| 5 | ~~Mesmo para Faltou~~ | ❌ **Doc incorreta** | Ver item 4 |
| 6 | WhatsApp follow-up | ✅ Código | `handleFollowUpWhatsApp`, `sendWhatsappTemplateOutbound` |
| 7 | Navegação lead + voltar Hoje | ✅ Código | `LEAD_PROFILE_FROM_DASHBOARD`, `handleProfileBack` em `LeadProfile.jsx` |
| 8 | Agenda da semana | ✅ Código | `DashboardAgendaWeekPanel`, `FOLLOWUP_AGENDA_MAX_DAYS` |
| 9 | Tarefas do dia | ⚠️ **Parcial** | KPI **Tarefas** navega para `/tarefas?status=pendentes&period=today` — não conclui inline no Hoje |
| 10 | Aniversários | ✅ Código | `DashboardBirthdayBanner`, `DashboardBirthdayModal` |
| 11 | Troca de academia | ✅ Código | Store `academyId`; ⚠️ validar em staging |

**Correções aplicadas:** mapa de telas e checklist itens 4–5 e 9.

---

## funil-lead-matricula

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1–2 | Novo lead + pipeline | ✅ Código | `NewLeadModal`, `Pipeline.jsx` |
| 3 | Kanban ↔ lista | ⚠️ **Desktop only** | Mobile (`≤1023px`) usa lista agrupada; kanban só desktop |
| 4–11 | Demais itens | ✅ Código | `performEnrollment`, export, perfil — testes `enrollmentFlow` passam |

**Nota adicionada** no fluxo sobre viewport mobile.

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
| [a-receber-mensalidades](financeiro/a-receber-mensalidades.md) | 12 | 12 | 0 | 12 |
| [lancamentos-caixa](financeiro/lancamentos-caixa.md) | 12 | 12 | 0 | 12 |
| [conciliacao-bancaria](financeiro/conciliacao-bancaria.md) | 12 | 12 | 0 | 12 |
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
| 4–11 | Filtros, modal pagamento, taxas, parcelas | ✅ Código | `MensalidadesPanel`, specs parcelamento/taxas |
| 12 | Export CSV | ✅ Código | `exportMensalidadesGridCsv` |

Harness: `mensalidades`, `paymentMethods`, `mensalidadesPaymentForm`.

---

## lancamentos-caixa

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `?tab=movimentacoes` | ✅ Código | `TransacoesTab` |
| 2 | `?new=1` abre modal | ✅ Código | `FINANCEIRO_NOVO_LANCAMENTO_PATH` em `naviMenu.js` |
| 3–11 | CRUD, liquidar, estornar, import, export | ✅ Código | `financeTxApi.js`, harness `finance-lancamentos.md` |
| 12 | Deep link `?tx=` | ✅ Código | `FinanceTxDetailDrawer` |

Harness: `financeTx` — testes passam.

---

## conciliacao-bancaria

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Owner: aba visível | ✅ Código | `buildFinanceiroOwnerLeafTabs` inclui `conciliacao` |
| 2 | Admin/member: redirect | ✅ Código | Só owner em `allowedLeafTabs`; `Caixa.jsx` normaliza URL |
| 3–4 | Import + detalhe | ✅ Código | `ImportStatementModal`, `ReconciliationTab` |
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
| [config-inicial-financeiro](financeiro/config-inicial-financeiro.md) | 12 owner + 5 admin | 17 | 0 | 17 |
| [plano-contas-categorias](financeiro/plano-contas-categorias.md) | 12 | 12 | 0 | 12 |

**Permissões Empresa → Financeiro** (`financeSettingsSections.js`):

| Seção | owner | admin |
|---|---|---|
| Planos, Régua, Contratos, Plano de contas, Razão | ✅ | oculta / redirect |
| Recebimento, Taxas, WhatsApp, Exceções | ✅ | ✅ |

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
| 9 | Taxas percentuais | ✅ Código | `FinanceSettingsFeesSection`, `feesConfigured` |
| 10 | Sticky save salvar/descartar | ✅ Código | `FinanceSettingsStickySave`, `hasDirty`, `persistAll` |
| 11 | Onboarding setup_finance | ✅ Código | `onboardingChecklist.js` → `/empresa?tab=financeiro` |
| 12 | Progress summaries | ✅ Código | `financeSettingsProgress` — owner 4 / admin 2 |

Harness: `financeSettingsSections` — 11 testes passam.

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
| [agente-ia-whatsapp](atendimento/agente-ia-whatsapp.md) | 12 | 12 | 0 | 12 |
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
| 3 | Setup 3 passos | ✅ Código | `setupProgress` em `AgenteIASection` |
| 4 | Zapster QR/status | ✅ Código | `useZapsterWhatsAppConnection` |
| 5 | Editar prompt | ✅ Código | `canEditAgentPrompt` |
| 6 | Ativar IA | ✅ Código | `iaAtiva`, webhooks |
| 7 | Legacy `?tab=agente` | ✅ Código | `Automacoes.jsx` navigate |
| 8–12 | Billing guard, inbox, multi-tenant | ✅ Código | `fetchWithBillingGuard`, `academyId` |

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

## Próximo passo

1. Executar checklists em **staging** com academia demo e marcar `status: revisado` → `gravado-em-video` após gravação.
2. Abrir issue para presença em `/students?view=presenca` via hub embutido (se prioritário).
3. **Opcional:** Recepção Control iD, Relatórios, Equipe.
