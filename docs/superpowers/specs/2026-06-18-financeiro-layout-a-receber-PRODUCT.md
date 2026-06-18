# Layout A receber — Mensalidades e Cobrança — PRODUCT Spec

**Data:** 2026-06-18  
**Status:** Implementado (2026-06-18)  
**TECH:** [2026-06-18-financeiro-layout-a-receber-TECH.md](./2026-06-18-financeiro-layout-a-receber-TECH.md)  
**Fluxo:** [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)

---

## 1. Problem Statement

Na aba **A receber** do Financeiro, duas sub-seções apresentam problemas de layout que prejudicam o uso diário:

### Mensalidades

A lista de alunos renderiza **tabela desktop e cards mobile simultaneamente** no desktop. Os cards aparecem abaixo da tabela, repetindo dados em blocos verticais sem grid. Causa: estilos responsivos removidos do `index.css` na migração para `finance.css` (commit `71e1b95`) sem recolocação.

### Cobrança

A fila de inadimplentes repete métricas já exibidas no KPI superior, mistura **métricas estáticas e filtros clicáveis** no mesmo grid visual, e possui **dois botões "Atualizar"** com escopos diferentes (o da subnav não recarrega a tabela).

**Quem sofre:** recepção e gestores que operam cobrança e mensalidades diariamente.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Desktop Mensalidades: apenas tabela visível | Sem cards mobile abaixo da tabela em viewport ≥ 768px |
| G2 | Mobile Mensalidades: apenas cards visíveis | Tabela oculta; cards com borda, ações e status legíveis |
| G3 | Cobrança: KPI único no topo | Sem bloco duplicado "Inadimplentes / Valor em aberto" no painel |
| G4 | Cobrança: um único "Atualizar" funcional | Botão da subnav recarrega fila + KPI |
| G5 | Cobrança: filtros distinguíveis de métricas | Chips de etapa (D+1, D+7…) com aparência de filtro |
| G6 | Zero regressão funcional | Busca, expandir meses, ações WhatsApp/Negociar/Adiar inalteradas |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| Menu dropdown na coluna Ações (Cobrança) | Melhoria futura; fora do escopo desta correção |
| Cards mobile dedicados para Cobrança | Tabela permanece no mobile nesta entrega |
| Redesign das 3 camadas de tabs do Financeiro | Escopo maior de IA |
| Novos endpoints `/api/` | Limite Vercel Hobby 12/12 |

---

## 4. Comportamento esperado

### 4.1 Mensalidades (lista)

- **Desktop (≥ 768px):** tabela com colunas ALUNO, Vencimento, Valor, Conta/Plataforma, Status, Ação.
- **Mobile (< 768px):** cards empilhados; tabela oculta.
- Badges de status, zebra, borda lateral em atraso e botões Registrar/Estornar preservados.

### 4.2 Cobrança (fila)

- **KPI superior** (shell `ReceivablesTab`): "Fila acumulada · últimos 12 meses" + valor + contagem de inadimplentes — **fonte única** de resumo.
- **Painel:** busca, link "Tarefas vencidas", faixa de **filtros por etapa** (Todos, D+1, D+7…), tabela.
- **Atualizar:** apenas na subnav; recarrega KPI e tabela.
- Rodapé informativo sobre janela de 12 meses mantido.

---

## 5. Critérios de aceite

- [ ] Desktop: Mensalidades sem conteúdo duplicado abaixo da tabela
- [ ] Mobile: Mensalidades com cards estilizados (não blocos crus)
- [ ] Cobrança: sem texto "Inadimplentes" / "Valor em aberto" no painel interno
- [ ] Cobrança: um botão Atualizar; clique atualiza linhas da tabela
- [ ] Filtros D+ visualmente distintos (chips com borda/padding)
- [ ] Testes `cobrancaPanel` passando

---

## 6. Validação

- Teste unitário: `npm test -- cobrancaPanel`
- Verificação manual: `/financeiro?tab=a-receber&section=mensalidades` e `section=cobranca` em desktop e mobile (DevTools)
