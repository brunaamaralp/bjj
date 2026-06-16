# Test Harness — Plano de Contas + Categorias

Refatoração do **plano de contas**, drawer de nova conta e **categorias no lançamento**.  
PRODUCT: [2026-06-15-plano-contas-categorias-PRODUCT.md](../superpowers/specs/2026-06-15-plano-contas-categorias-PRODUCT.md)  
TECH: [2026-06-15-plano-contas-categorias-TECH.md](../superpowers/specs/2026-06-15-plano-contas-categorias-TECH.md)

## Rodar

| Comando | Escopo |
|---|---|
| `npm test -- financeAccountFormRules financeCategories financeAccountCategories financeAccountsDrawer financeTxCategorySelect` | Suite da feature |
| `npm run test:ci` | Gate completo antes de merge |

## Checkpoint

```bash
npm run test:ci
# … alterações …
npm run test:ci
npm run build
```

## Mapa de testes

| Camada | Arquivo | Garante |
|---|---|---|
| Unit | `tests/unit/finance/financeAccountFormRules.test.js` | Validação drawer, herança subconta, duplicata, protegido, DRE obrigatório |
| Unit | `tests/unit/finance/financeCategories.test.js` | Dedup `acct:4.1.1`, ordem grupos saída, `defaultCategoryForDirection` |
| Unit | `tests/unit/finance/financeAccountCategories.test.js` | Label só nome, title com código |
| Component | `src/test/financeAccountsDrawer.test.jsx` | FieldError inline, herança subconta no drawer |
| Component | `src/test/financeTxCategorySelect.test.jsx` | Default saída, chips, sem duplicata fixo+conta |

## Critérios de aceite (automáticos)

- [ ] Código/nome vazios → erro no campo (não só toast)
- [ ] Subconta de despesa herda tipo/natureza/DRE do pai
- [ ] `4.1.1` não aparece no select quando duplica Mensalidades
- [ ] `4.1.2` custom permanece visível
- [ ] Tipo Saída → default «Outras despesas»
- [ ] Grupos de saída: Despesas Operacionais antes de CMV/CPV

## QA manual

1. Config → Avançado → Plano de contas: criar subconta `4.1.2` receita → aparece no lançamento entrada
2. Novo lançamento → Saída → default «Outras despesas»; chips funcionam
3. Importar planilha modelo → linhas `4.1.2` e `6.2.3` presentes
4. Liquidar mensalidade automática → razão `1.1.1` / `4.1.1` inalterado
