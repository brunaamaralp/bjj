# Consolidação Extrato Contábil — TECH

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-financeiro-extrato-consolidacao-PRODUCT.md](./2026-06-15-financeiro-extrato-consolidacao-PRODUCT.md)

---

## Arquivos novos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/financeTxJournalMirror.js` | Resolver espelho por tx, formatar linhas |
| `src/test/financeTxJournalMirror.test.js` | Unit tests do resolver |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `FinanceTxDetailDrawer.jsx` | Seção Espelho contábil |
| `styles/tx-drawer.css` | Estilos espelho |
| `TransacoesTab.jsx` | Passar academyId, journal ao drawer |
| `financeSettingsSections.js` | Seção `razao-contabil` |
| `FinanceiroConfigTab.jsx` | JournalTab na seção razão |
| `CaixaAccountingPanel.jsx` | Remover scope operational |
| `financeiroHubTabs.js` | Remover aba, helpers redirect |
| `Caixa.jsx` | Navigate legado |
| `ReportsFinancePanel.jsx` | Link atualizado |
| `financeiroHubTabs.test.js` | Tabs + redirect |
| `financeTxDetailDrawer.test.jsx` | Espelho RTL |

---

## Resolver

```js
resolveTxJournalMirror({ tx, accounts, journalEntries })
findJournalEntryForTx(entries, txId) // financial_tx_id → memo
formatJournalLineDisplay(line, accountById)
```

Fallback Appwrite no drawer: `Query.equal('financial_tx_id', txId)` + `academyId`.

---

## Testes

```bash
npm test -- financeTxJournalMirror financeTxDetailDrawer financeiroHubTabs financeSettingsSections
```
