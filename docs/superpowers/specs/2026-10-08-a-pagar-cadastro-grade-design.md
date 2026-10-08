# A pagar — aba Cadastro (grade mensal)

| Campo | Valor |
|---|---|
| **status** | approved |
| **data** | 2026-10-08 |
| **módulo** | Financeiro / A pagar |

## Objetivo

Tela só consultiva com todas as contas fixas ativas (fornecedor, categoria, dia, valor, status) e grade mensal indicando pago / em aberto / vencido / sem registro.

## Decisão de produto

- Nova aba `section=cadastro` em A pagar
- Só templates recorrentes ativos (cancelados omitidos)
- Janela: últimos 6 meses + atual + próximos 2
- Sem ações de pagar/editar na aba

## Células

| Estado | Critério |
|---|---|
| `paid` | TX settled com `recurrence_origin_id` + `competence_month` |
| `open` | TX pending no mês, due >= hoje |
| `overdue` | TX pending no mês, due < hoje |
| `empty` | sem registro |

## Arquivos

- `src/lib/payablesCadastro.js` — janela + grade (puro)
- `lib/server/payablesData.js` — listar instâncias por templates/janela
- `lib/server/payablesHandler.js` — `section=cadastro` → `cadastro` no payload
- `src/lib/financeiroPayablesSections.js` — constante/label
- `src/components/finance/PayablesCadastroPanel.jsx` — UI
- `src/components/finance/PayablesTab.jsx` — wire
- `docs/flows/financeiro/a-pagar-contas-fixas.md`
