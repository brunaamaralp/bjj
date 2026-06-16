# Plano `durationDays` (campo fantasma) — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-plano-duration-days-fantasma-TECH.md](./2026-06-15-plano-duration-days-fantasma-TECH.md)  
**Origem:** auditoria gaps Financeiro #5 (severidade Média)

---

## 1. Problem Statement

O formulário de **Planos de mensalidade** expõe **“Duração (dias)”** e o texto da seção sugere vigência comercial (30 = mensal, 90 = trimestral). O valor é persistido em `financeConfig.plans[].durationDays` e aparece na importação de planos.

Nenhum fluxo de **cobrança** usa esse campo: mensalidades usam **preço do plano** + **dia de vencimento do aluno**. O mesmo nome `durationDays` em **trancamento de plano** (`PlanFreezeModal`) é outro conceito (dias de pausa).

**Risco:** academia configura “trimestral 90 dias” achando que a cobrança muda; nada muda no financeiro.

---

## 2. Decisão v1

**Remover da UI e deixar de persistir** `durationDays` em planos novos/alterados.

| Alternativa | Decisão |
|-------------|---------|
| Implementar planos não-mensais | Fora de escopo (spec futura) |
| Renomear para “informativo” | Rejeitado — ainda confunde |
| Remover UI + strip no save | **Adotado** |

Dados legados com `durationDays` no JSON podem permanecer até o próximo save da academia; `compactPlanForStorage` deixa de gravar o campo.

---

## 3. Goals

| # | Objetivo |
|---|----------|
| G1 | Operador não vê campo que não tem efeito |
| G2 | Copy explica vencimento no **aluno**, cobrança **mensal** por preço do plano |
| G3 | Import/export deixa de promover `durationDays` |
| G4 | Trancamento de plano inalterado (`PlanFreezeModal`) |

---

## 4. Non-Goals

- Ciclo trimestral/anual automático
- Migração em massa de JSON antigo
- `ConfigTab.jsx` legado (fora de rotas) — ajuste opcional por consistência

---

## 5. Acceptance criteria

- [x] Sem input “Duração (dias)” em Planos (Minha Academia)
- [x] Lead da seção sem referência a vigência por dias no plano
- [x] Novo plano não inclui `durationDays` ao salvar
- [x] Preview import planos sem coluna Duração
- [x] `planFreezeCore` / NL `freeze_plan` inalterados
