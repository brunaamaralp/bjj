# A pagar — fila operacional agrupada (trilha B)

**Data:** 2026-09-22  
**Status:** Implementado  
**Persona:** owner, admin  
**Fluxo:** [financeiro/a-pagar-contas-fixas.md](../../flows/financeiro/a-pagar-contas-fixas.md)  
**Produto base:** [2026-06-16-contas-a-pagar-PRODUCT.md](./2026-06-16-contas-a-pagar-PRODUCT.md)  
**Pré-requisito:** [2026-09-22-a-pagar-clareza-vencimento-design.md](./2026-09-22-a-pagar-clareza-vencimento-design.md) (trilha A)

---

## Problema

Em Contas fixas, instâncias pendentes (`lancamento`) e templates recorrentes (`template`) aparecem na mesma lista. O gestor não distingue rápido o que já é obrigação cobrável do que só está programado para o próximo ciclo.

## Goals

1. Separar visualmente **A pagar agora** vs **Programadas** na seção Contas fixas.
2. Manter filtros da trilha A (busca, categoria, chips de vencimento) aplicados sobre os itens de cada grupo.
3. Zero mudança de navegação (sem sub-aba nova, sem query param).

## Non-goals

- Cards mobile
- Editar template na fila (valor/dia/categoria)
- Mudar Visão geral ou seção Vencidas
- Renomear KPI “Em aberto (90 dias)”
- Sub-abas Agora / Programadas
- Alterar dedup/agregação de API (só apresentação + split no cliente)

---

## Grupos

Só em `section=contas-fixas`, após filtros.

| Grupo | Critério | Título UI |
|-------|----------|-----------|
| Agora | `source === lancamento` ou `source === recorrencia` | **A pagar agora** (`N`) |
| Programadas | `source === template` | **Programadas** (`N`) |

Ordem na página: **A pagar agora** primeiro, depois **Programadas**. Dentro de cada grupo: ordenação atual por `due_date` (já via `mergePayableItems`).

### Empty / omissão

| Situação | UI |
|----------|-----|
| Grupo com 0 itens após filtro | **Não** renderizar cabeçalho nem tabela daquele grupo |
| Ambos vazios e há itens no catálogo (filtro ativo) | Empty “Nenhum resultado” + limpar filtros (trilha A) |
| Ambos vazios e catálogo da seção vazio | Empty “Nenhuma conta programada” + Nova conta |

---

## UI

- Cabeçalho de grupo: `navi-section-heading` (ou equivalente compacto do finance) + contagem.
- Mesmas colunas da tabela atual (Vencimento + hint, Fornecedor, Categoria, Valor, Status, Ações).
- Ações inalteradas: Pagar / Editar / Ver lançamento / Excluir em lancamento; Pagar / Cancelar em template.
- Chips e busca ficam **acima** dos dois grupos (barra única).

Não duplicar `<thead>` global — cada grupo pode ter sua própria tabela compacta com thead (facilita leitura ao rolar) **ou** um thead no primeiro grupo visível. Preferência: **thead em cada grupo** para acessibilidade ao pular seções.

---

## Código

| Peça | Ação |
|------|------|
| `src/lib/payablesAggregate.js` ou helper display | `splitPayablesOperationalGroups(items) → { now, scheduled }` |
| `PayablesTab.jsx` | Renderizar dois blocos em Contas fixas; Vencidas continua lista única |
| Testes | Unitário do split (sources → grupos) |
| Fluxo `a-pagar-contas-fixas.md` | Mapa + checklist + histórico |

`selectPayablesItems` / API inalterados — split só na UI (ou helper puro sobre a lista já filtrada).

---

## Aceite

- [x] Contas fixas com pending + template mostra duas seções na ordem Agora → Programadas
- [x] Só templates → só “Programadas”; só pending → só “A pagar agora”
- [x] Contagem no título bate com linhas do grupo
- [x] Chip/busca que zera um grupo omite esse grupo; que zera os dois → empty filtrado
- [x] Vencidas e Visão sem mudança de agrupamento
- [x] Teste unitário do split
- [x] Fluxo atualizado no mesmo PR
