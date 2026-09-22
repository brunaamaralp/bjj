# Trancamento de plano semestral

**Data:** 2026-09-22  
**Status:** aprovado — implementação

## Problema

O botão **Trancar matrícula** só aparece para planos anuais (`isAnnualPlanStudent` / `canStartPlanFreeze`). Academias com plano semestral não conseguem pausar a matrícula.

## Decisão

Estender a regra atual em `lib/planFreezeCore.js` (abordagem 1):

| Tipo | Detecção | Cota | Ciclo da cota |
|------|----------|------|----------------|
| Anual | `plan_billing` anual **ou** nome contém `anual` | 90 dias | ~365 dias (aniversário da matrícula) — inalterado |
| Semestral | `plan_billing` ∈ `{semestral, semiannual, semester}` **ou** nome contém `semestral` | 45 dias | ~182 dias a partir da matrícula |
| Outros | — | — | sem trancamento |

- Alerta de limite: proporção ~83% da cota (anual 75/90 → semestral 37/45).
- Fluxo (modal, indefinido, pagamentos frozen, bundle, catraca, IA): inalterado; só passa a usar cota/ciclo do tipo do plano.
- Fora de escopo: mensal, trimestral, campo explícito no catálogo de planos, detecção por “6 meses”.

## API (núcleo)

- `isSemesterPlanStudent(student, financeConfig?)`
- `resolveFreezePlanKind` → `'annual' | 'semester' | null`
- `canStartPlanFreeze` → true se kind ≠ null e cota restante > 0
- `freezeQuotaMaxDays` / `freezePeriodDays` / `freezeLimitAlertDays` por aluno
- `planCycleStartYmd` generaliza o âncora (anual 365, semestral 182); `planYearStartYmd` permanece como atalho anual
- Mensagens de validação/UI usam a cota dinâmica (não hardcode 90)

## Não-objetivos

- Trancar mensal/trimestral
- Migrar `durationDays` fantasma do catálogo
- Mudar regras de extensão de bundle além do que já existe por dias usados
