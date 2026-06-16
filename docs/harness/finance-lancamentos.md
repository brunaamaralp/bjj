# Test Harness — Lançamentos (Financeiro)

Refatoração da aba **Movimentações** (`/financeiro?tab=movimentacoes`).  
PRODUCT: [2026-06-15-financeiro-lancamentos-refactor-PRODUCT.md](../superpowers/specs/2026-06-15-financeiro-lancamentos-refactor-PRODUCT.md)

## Rodar

| Comando | Escopo |
|---|---|
| `npm test -- financeTx` | Suite rápida da feature (~30 testes) |
| `npm test -- financeTxLeadEnrichment` | Server: enriquecimento `lead_name` |
| `npm test -- financeTxTabState` | URL filters + colunas opcionais |
| `npm test -- FinanceTxDetailDrawer FinanceTxStudentField` | Componentes RTL |
| `npm run test:ci` | Gate completo antes de merge |

## Checkpoint (antes/depois de refactor)

```bash
npm run test:ci          # baseline verde
# … alterações …
npm run test:ci          # sem regressão
npm run build            # build Next + Vite
```

## Mapa de testes

| Camada | Arquivo | Garante |
|---|---|---|
| Server unit | `tests/unit/finance/financeTxLeadEnrichment.test.js` | Batch lookup Appwrite, dedup ids, fallback `lead_name`, tolerância a erro |
| Server unit | `tests/unit/finance/financeTxFields.test.js` | `mapFinanceTxDoc` inclui `lead_name` |
| Client unit | `src/test/financeTxLeadNames.test.js` | Resolve nome (API → store → órfão) |
| Client unit | `src/test/financeTxExport.test.js` | Filtros status/dir/banco/busca + CSV |
| Client unit | `src/test/financeTxTabState.test.js` | `?status` `?dir` `?q`, colunas localStorage, copy modal |
| Component | `src/test/financeTxDetailDrawer.test.jsx` | Drawer render, aluno, ESC/fechar |
| Component | `src/test/financeTxStudentField.test.jsx` | Debounce 280ms, API search, seleção |

## Critérios de aceite (automáticos)

- [ ] Coluna **Aluno** nunca vazia quando `lead_id` + nome existem (`lead_name` ou store)
- [ ] Busca toolbar encontra por `tx.lead_name` sem depender do store
- [ ] Filtros URL serializam/deserializam corretamente
- [ ] Modal busca aluno via API (mín. 2 chars, debounce)
- [ ] Drawer exibe todos os campos e fallback órfão

## QA manual (pós-deploy)

1. Sessão limpa (sem alunos no store) → abrir Lançamentos → coluna Aluno preenchida
2. Novo lançamento → buscar aluno por nome/telefone → selecionar
3. Clicar linha → drawer abre; ESC fecha
4. `?tx=<id>` abre drawer após load
5. Filtros status/dir/busca refletem na URL e persistem ao recarregar

## Adicionar testes

1. Lógica pura → `src/lib/*.js` ou `lib/server/*.js` + teste colocalizado em `src/test/` ou `tests/unit/finance/`
2. UI isolada → `src/test/<Component>.test.jsx` com mocks de API/store
3. Fluxo handler → `tests/integration/` (mock Appwrite como em `financeClosingData.test.js`)

Não mockar o store de alunos para testar coluna Aluno — usar `lead_name` server-side (P0 da spec).
