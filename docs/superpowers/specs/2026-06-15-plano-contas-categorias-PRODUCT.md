# Plano de Contas + Categorias — Refatoração UX e Integridade

**Data:** 2026-06-15  
**Status:** Aprovado para implementação  
**TECH:** [2026-06-15-plano-contas-categorias-TECH.md](./2026-06-15-plano-contas-categorias-TECH.md)  
**Abordagem:** 3 fases (P0 integridade → P1 UX operacional → P2 polish)  
**Estratégia v1:** Incremental — `FINANCE_CATEGORIES` permanece para automações; UI deduplica contas que repetem `dreAccount` fixo.

---

## 1. Problem Statement

Três auditorias (plano de contas, drawer de nova conta, categorias no lançamento) revelam o mesmo gap de ponta a ponta:

1. **Plano de contas opcional** — subcontas criadas com defaults errados (ativo/devedora) não aparecem no caixa.
2. **Drawer sem validação estruturada** — erros só em toast; códigos duplicados/protegidos permitidos; DRE texto livre.
3. **Categorias duplicadas no lançamento** — «Mensalidades» e «4.1.1 · Receita de Vendas» lado a lado; default de saída = CMV.

**Quem sofre:** owner/gestor (configura sem efeito) e operador do caixa (hesita na classificação).

**Custo de não resolver:** lançamentos errados, DRE «Não classificado», perda de confiança no módulo Avançado.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Subconta útil no caixa | 100% subcontas receita/despesa aparecem no select |
| G2 | Zero duplicata no lançamento | 0 pares fixo+conta com mesmo `dreAccount` visíveis |
| G3 | Default saída correto | Tipo→Saída = «Outras despesas» |
| G4 | Integridade do plano | 0 códigos duplicados; 0 create em `PROTECTED_CODES` |
| G5 | DRE confiável | Contas de resultado exigem `dreGrupo` válido |
| G6 | Zero regressão | Liquidar, estornar, mensalidade auto, import/export intactos |

---

## 3. Non-Goals

- Novo arquivo em `/api/` (limite Hobby 12/12).
- Mapeamento configurável fixo→conta (futuro).
- Plano como única fonte no espelho automático.
- Contabilidade de competência completa (ativo/passivo no lançamento).
- Redesign do hub Financeiro ou árvore de 500 contas.
- Alterar schema `ACCOUNTS_COL`.
- Contas sintéticas obrigatórias no seed.

---

## 4. User Stories

### Owner — Plano de contas

- Criar subconta herdando tipo, natureza e DRE do pai.
- Erros inline em código/nome/duplicata/protegido.
- Grupo DRE via select alinhado ao import.

### Operador — Novo lançamento

- Entrada default «Mensalidades»; saída default «Outras despesas».
- Chips para categorias frequentes; combobox com affordance clara.
- Sem duplicatas fixo vs conta.

### Contador

- Exportar plano com DRE preenchido.
- Contas custom só quando código ≠ `dreAccount` fixo.

### Edge cases

- Exclusão com subcontas ou lançamentos: mensagem contextual.
- Conta inativa fora do select (mantido).
- Member sem saída (mantido).

---

## 5. Requirements por fase

### Fase 1 — P0 Integridade

**Drawer:** R1.1 FieldError código/nome · R1.2 duplicata · R1.3 protegido · R1.4 herança subconta · R1.5 tipo→natureza+DRE · R1.6 DRE select · R1.7 exclusão contextual

**Lançamento:** R1.8 dedup fixo/conta · R1.9 conta custom visível · R1.10 default saída

### Fase 2 — P1 UX

R2.1 chips frequentes · R2.2 affordance combobox · R2.3 ordem grupos saída · R2.4 label só nome · R2.5 colunas DRE/Ativa · R2.6 filtro tipo · R2.7 DRE fechado no create · R2.8 scroll lock + dirty close

### Fase 3 — P2 Polish

R3.1 teclado combobox · R3.2 portal dropdown · R3.3 categorias recentes · R3.4 onboarding · R3.5 template import · R3.6 PL → Patrimônio Líquido

---

## 6. Success Metrics

**Leading:** 0 relatos duplicata; QA checklist 100%; seleção saída < 5s (QA).

**Lagging:** menos «Não classificado» na DRE; ≥30% academias com subcontas custom.

---

## 7. QA Checklist

**Plano / drawer**

- [ ] Erros inline código/nome
- [ ] Subconta receita herda e aparece em entrada
- [ ] Duplicata e protegido bloqueados
- [ ] DRE select = import
- [ ] Exclusão cita lançamentos/subcontas

**Lançamento**

- [ ] Entrada Mensalidades; saída Outras despesas
- [ ] Sem 4.1.1 duplicando Mensalidades
- [ ] 4.1.2 custom visível e liquida correto
- [ ] Chips 1 clique
- [ ] Mobile lista não cortada (Fase 3)

**Regressão**

- [ ] Mensalidade auto → 1.1.1 / 4.1.1
- [ ] Export/import CSV
- [ ] DRE inalterada só-categorias-fixas
