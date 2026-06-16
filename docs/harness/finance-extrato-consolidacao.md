# Test Harness — Consolidação Extrato Contábil

PRODUCT: [2026-06-15-financeiro-extrato-consolidacao-PRODUCT.md](../superpowers/specs/2026-06-15-financeiro-extrato-consolidacao-PRODUCT.md)

## Rodar

| Comando | Escopo |
|---|---|
| `npm test -- financeTxJournalMirror financeTxDetailDrawer financeiroHubTabs financeSettingsSections` | Suite da feature |
| `npm run test:ci` | Gate completo |
| `npm run build` | Build |

## QA manual

1. Liquidar tx → drawer → espelho D/C
2. Tx pendente → "Será contabilizado ao liquidar"
3. Owner → Minha academia → Razão contábil → partida manual
4. `/financeiro?tab=extrato` → redirect config
5. Member → sem espelho no drawer
