# Expandir categorias fixas (híbrido) — Design

**Data:** 2026-09-08  
**Status:** Aprovado para implementação  
**Abordagem:** Incremental no código (FINANCE_CATEGORIES + seed + espelho)

## Goals

- Mais opções prontas no select de lançamentos (todas as academias).
- DRE/DFC/razão mais granulares para categorias **novas** (conta própria).
- Categorias antigas permanecem agregadas (`4.1.1`, `6.2.1`, …).

## Non-goals

- Remapear labels antigas para contas novas.
- UI para owner criar categoria fixa.
- Backfill de TXs históricas.
- Schema Appwrite novo / nova API function.

## Catálogo

| Chave | Label | type | dreGroup | dreAccount | cashFlowClass |
|---|---|---|---|---|---|
| AULAS_AVULSAS | Aulas avulsas / day pass | other | Receita Bruta | 4.1.2 | receita_servico |
| EVENTOS_SEMINARIOS | Eventos e seminários | other | Receita Bruta | 4.1.3 | receita_servico |
| PATROCINIOS | Patrocínios | other | Receita Bruta | 4.1.4 | receita_servico |
| LIMPEZA | Limpeza e higiene | expense_operational | Despesas Operacionais | 6.2.3 | desp_fixa |
| MATERIAL_TREINO | Material de treino (faixas, tatame…) | expense_operational | Despesas Operacionais | 6.2.4 | desp_variavel |
| TRANSPORTE | Transporte e combustível | expense_operational | Despesas Operacionais | 6.2.5 | desp_variavel |
| SEGURO | Seguros | expense_operational | Despesas Operacionais | 6.2.6 | desp_fixa |
| CONTABILIDADE | Contabilidade e honorários | expense_operational | Despesas Operacionais | 6.2.7 | desp_fixa |
| CAPACITACAO | Capacitação de professores | expense_operational | Despesas Operacionais | 6.2.8 | desp_variavel |
| EQUIPAMENTOS_PEQ | Equipamentos e utensílios | expense_operational | Despesas Operacionais | 6.2.9 | desp_variavel |

Reclaim de códigos de exemplo do template de import (`4.1.2` / `6.2.3`). Fixtures de teste que usavam esses códigos como conta custom passam a `4.1.5` / `6.2.10`.

## Espelho

`montarLancamento`: em rotas agregadas por tipo, se a categoria resolvida tiver `dreAccount`, usar esse código no lado de resultado (crédito em entradas / débito em saídas), em vez do default do `ACCOUNT_MAP` (ex. `4.1.1` / `6.2.1`).

## Seed / migração

- Incluir as 10 contas em `seedAccounts` e `DEFAULT_ACCOUNTS` (server).
- Academias com plano existente: **merge por código** (criar só se faltar); não renomear conta existente.
- `PROTECTED_CODES` / dedup no select via `dreAccount` já existentes.

## Persistência

`FINANCIAL_TX.category` continua gravando o **label**.

## Testes

- Resolve / options das novas categorias; códigos ocultos no select.
- `montarLancamento`: Limpeza → `6.2.3`; Outras despesas → `6.2.1`; Aulas avulsas → `4.1.2`.
- Merge de seeds faltantes.
