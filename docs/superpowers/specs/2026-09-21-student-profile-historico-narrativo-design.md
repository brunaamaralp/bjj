# Perfil do aluno — aba Pagamentos como histórico misto + copy narrativa

**Data:** 2026-09-21  
**Status:** Implementado  
**Persona principal:** recepcionista (entender o que o aluno pagou e comprou sem caçar filtros)  
**Fluxo:** [crm/aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)  
**Complementa:** [2026-07-16-student-profile-payments-status-first-design.md](./2026-07-16-student-profile-payments-status-first-design.md) (topo status-first permanece; este spec altera defaults + copy do ledger)  
**Componente:** `StudentFinancialTimeline` + `buildFinancialTimelineItems`

---

## Problema

A aba financeira do perfil já tem ledger unificado (mensalidades, pacotes, produtos, taxas), mas:

1. O filtro padrão **Mensalidades** fazia a UI parecer só de mensalidade.
2. Linhas de venda usam `items_summary` sem verbo — não se lê “comprou camiseta / kimono”.
3. Recepção precisava mudar filtro para ver compras; a história do aluno não aparecia de cara.

## Goals

1. Abrir a aba e ver **tudo** relevante dos últimos 3 meses (mensalidade + compras + taxas) sem mudar filtro.
2. Cada linha fechada contar a história em linguagem de balcão (`Pagou…` / `Comprou…`).
3. Manter o topo status-first (Em dia / Em atraso + Registrar pagamento) intacto.
4. Mudança mínima de UI — sem novo layout, sem chip de tipo, sem agrupamento por mês.

## Non-goals

- Redesign do `SituationHero`, modal de pagamento ou fluxos de venda
- Abordagens 2/3 (extrato agrupado por mês; duas listas separadas)
- Chip de tipo ao lado do badge de status
- Novo card de resumo / totais além do que já existe (`ExtratoTotalsCard` quando houver extrato unificado)
- Mudanças em Mensalidades hub, Loja → Vendas ou Caixa
- Renomear id interno da tab (`payments` permanece)

## Decisão de produto

| Item | Decisão |
|------|----------|
| Nome da aba | **Pagamentos** (rótulo); conteúdo = histórico de compras e pagamentos |
| Confusão com **Linha do tempo** | Sem conflito — tab continua “Pagamentos”; Linha do tempo é eventos gerais |
| Filtro tipo padrão | **Todos** (`TIMELINE_FILTER_TYPES.ALL`) |
| Período padrão | **Últimos 3 meses** (inalterado) |
| Chip de tipo | **Não** — o verbo no título basta |
| Truncamento de compra | Até **2** nomes de item; se mais: `e mais N` |

## UI

### Aba

- Label: **Pagamentos**
- Conteúdo: histórico misto (mensalidades, planos, produtos, taxas)
- `aria-label` / teaser: “Abrir aba Pagamentos”
- Id de rota/estado: `payments` (deep-link `?tab=payments`)

### Defaults do ledger

- `DEFAULT_TIMELINE_TYPE_FILTER` = `all`
- `DEFAULT_TIMELINE_PERIOD_FILTER` = `3m`
- Placeholders do `CompactStatusFilter` alinhados ao default (não mais placeholder “Mensalidades” como se fosse o estado inicial)

### Linha fechada (copy narrativa)

Construir `title` (ou `ledgerTitle`) em `buildFinancialTimelineItems`.

**Verbo só quando o status confirma o fato** (evita “Pagou” em atraso / pendente):

| kind + status | Título |
|---------------|--------|
| `plan` pago / parcial / coberto | `Pagou mensalidade — {mês longo}` |
| `plan` pendente / atrasado / cancelado | `Mensalidade — {mês longo}` (badge já diz o status) |
| `bundle` pago (não histórico) | `Pagou mensalidade — {mês âncora}` (subtitle = cobertura) |
| `bundle` histórico | `Cobertura histórica — {mês}` (nunca forçar “Pagou”) |
| `product` concluída / pendente | `Comprou {itens…}` (badge Concluída/Pendente) |
| `product` cancelada | `Compra cancelada — {itens…}` |
| `fee` pago | `Pagou taxa — {note}` ou `Pagou taxa / avulso` |
| `fee` não pago | `Taxa — {note}` ou `Taxa / avulso` |
| `other` pago | `Pagou — {note}` ou `Outro pagamento` |
| `other` não pago | `{note}` ou `Outro pagamento` |
| `freeze` | Inalterado (`Trancamento — …`) |

**Produto — fonte dos nomes:** preferir `sale.items[].display_label` (ou equivalente já usado no expand); fallback `items_summary`; se vazio: `Comprou produtos` / `Compra cancelada — produtos`. Truncar em **2** itens + `e mais N`.

**Badge de status:** inalterado (Pago / Atrasado / Concluída / Cancelada / …).  
**Ícone por kind:** inalterado (calendário / sacola / recibo / cadeado).  
**Expand:** inalterado (data, subtitle/método, itens, PDF, ações, detalhe da venda).

### O que não muda

- `SituationHero` + CTA Registrar pagamento
- Trancamento / cobertura histórica / footer “Ver na Mensalidades” / “Ver venda em Vendas”
- Limites de fetch (~120 pagamentos, ~50 vendas)
- Estrutura CSS do ledger (`student-pay-ledger-row`)

## Dados / código

- `src/lib/studentFinancialTimeline.js` — defaults + títulos narrativos (+ helper de truncate de itens de venda se couber no mesmo módulo)
- `src/components/student/StudentFinancialTimeline.jsx` — placeholders do filtro
- `src/pages/StudentProfile.jsx` — label da tab + aria do teaser
- Testes: `src/test/studentFinancialTimeline.test.js` — default `all`; asserts de copy
- Docs de fluxo: checklist em `docs/flows/crm/aluno-perfil-presenca.md` (aba Pagamentos = histórico misto; default Todos · 3 meses)
- Spec antigo 2026-07-16: defaults “Mensalidades” ficam **superseded** por este doc (não reescrever o histórico; linkar daqui)

## Aceite

- [x] Aba do perfil mostra **Pagamentos**; lista é histórico misto (compras + pagamentos)
- [x] Ao abrir a aba, filtro tipo = **Todos** e período = **3 meses** sem ação do usuário
- [x] Com aluno que tem mensalidade + venda no período, **ambas** aparecem na lista sem mudar filtro
- [x] Mensalidade **paga** começa com **Pagou mensalidade**; mensalidade **em atraso/pendente** usa **Mensalidade —** (sem “Pagou”)
- [x] Venda começa com **Comprou** (ou **Compra cancelada**) e lista itens (máx. 2 + “e mais N”)
- [x] Sem chip de tipo novo na linha
- [x] Topo Em dia / Em atraso + Registrar pagamento intactos
- [x] Deep-link `?tab=payments` continua abrindo esta aba
- [x] Checklist do fluxo `aluno-perfil-presenca` atualizado
- [x] Testes `studentFinancialTimeline` + recibo verdes

## Fora de escopo / follow-ups possíveis

- Paginação se >50 vendas no perfil
- Agrupamento por mês (abordagem 2)
- Empty state diferenciado “sem movimento nos últimos 3 meses” vs “sem dados nunca”
