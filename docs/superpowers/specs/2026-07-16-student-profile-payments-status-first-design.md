# Perfil do aluno — Pagamentos status-first (design)

**Data:** 2026-07-16  
**Status:** Aprovado (implementar)  
**Persona principal:** recepcionista (job #1: ver se o aluno está em dia)  
**Fluxo:** [crm/aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)  
**Componente:** `StudentFinancialTimeline` (aba Pagamentos do perfil)

---

## Problema

A aba Pagamentos no painel lateral mistura status operacional, extrato contábil e gestão avançada. Com histórico longo, vira parede de cards; o CTA “Registrar pagamento” fica no fim; pode haver lista duplicada (extrato unificado + detalhamento).

## Goals

1. Em &lt;3 segundos a recepção lê **Em dia / Em atraso / Coberto / Trancado / Isento**.
2. Histórico legível em painel estreito (ledger de uma linha, não cards altos).
3. Remover duplicação de listas; ações destrutivas só no expand/menu.

## Non-goals

- Redesign do modal de pagamento
- Modo “Extrato completo” separado (owner)
- Mudanças em conciliação / Mensalidades hub

## UI

### Faixa de situação (topo)

- Situação em destaque (tom success/danger/muted)
- Plano + vencimento/cobertura
- CTA **+ Registrar pagamento** imediatamente abaixo (se não trancado)

### Ledger

- Default filtro: **Mensalidades** + **últimos 3 meses**
- Linha: mês/título · badge · valor · expand
- Editar / Excluir / PDF / detalhes de pacote só no expand
- Pacote: uma linha; meses cobertos no expand

### Extrato unificado

- Se presente: **só** card de totais + export CSV (sem as 30 linhas)
- Detalhamento = ledger único abaixo

### Trancamento

- Link/botão discreto, não full-width no meio do fluxo

## Dados

Reutilizar `buildFinancialSummary`, `paymentStatus`, `buildFinancialTimelineItems`, filtros existentes. Ajustar labels de situação para linguagem de balcão (“Em atraso” quando pendente/atrasado).

## Aceite

- [x] Topo mostra situação sem scroll
- [x] Registrar pagamento visível sem rolar a lista
- [x] Sem segunda lista de extrato unificado
- [x] Default 3 meses + mensalidades
- [x] Ações Editar/Excluir não aparecem com linha colapsada
