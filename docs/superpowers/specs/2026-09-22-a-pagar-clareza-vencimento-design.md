# A pagar — clareza de vencimento (trilha A)

**Data:** 2026-09-22  
**Status:** Implementado  
**Persona:** owner, admin  
**Fluxo:** [financeiro/a-pagar-contas-fixas.md](../../flows/financeiro/a-pagar-contas-fixas.md)  
**Produto base:** [2026-06-16-contas-a-pagar-PRODUCT.md](./2026-06-16-contas-a-pagar-PRODUCT.md)

---

## Problema

Na fila A pagar, o gestor não enxerga rápido o que é urgente. A data aparece só como `dd/mm/aaaa`; o badge misturava “Em aberto” com conta ainda não vencida; “Vence em breve” inclui hoje e os próximos 7 dias sem distinguir.

## Goals

1. Status de calendário inequívocos: vencida · vence hoje · vence em breve · a vencer.
2. Hint relativo na coluna Vencimento (`hoje`, `há N dias`, `em N dias`).
3. Filtro rápido na seção Contas fixas para focar a janela de 7 dias / a vencer / vencidas.
4. Helper único de rótulos (evitar drift entre Tab e Visão).

## Non-goals

- Agrupar “a pagar agora” vs. “programadas” (trilha B)
- Cards mobile
- Editar template na fila
- Renomear KPI “Em aberto (90 dias)” (saldo total, semântica distinta)
- Anexo de boleto / lembrete D-3 / pagamento parcial

---

## Status derivados

Núcleo: `classifyPayableStatus(dueYmd, todayYmd)` em `src/lib/payablesAggregate.js`.

| Status interno | Regra | Badge UI |
|----------------|-------|----------|
| `overdue` | `due < hoje` | Vencida |
| `due_today` | `due === hoje` | Vence hoje |
| `due_soon` | `hoje < due ≤ hoje+7` | Vence em breve |
| `open` | `due > hoje+7` (ou sem data) | A vencer |

### KPIs / summary

- `overdueCount` / `overdueAmount`: só `overdue` (inalterado).
- `dueSoonCount` / `dueSoonAmount`: **`due_today` + `due_soon`** (janela “esta semana”, incluindo hoje).
- Hint do KPI shell (“N vencem em 7 dias”) continua válido com essa soma.
- Seção **Vencidas**: continua filtrando só `overdue`.

### Badge classes (existentes)

| Status | Classe |
|--------|--------|
| `overdue` | `finance-badge-atraso` |
| `due_today` | `finance-badge-aguardando` (mesmo tom de urgência próxima) |
| `due_soon` | `finance-badge-aguardando` |
| `open` | `finance-badge-pendente` |

---

## Coluna Vencimento

Formato: `dd/mm/aaaa` + hint em texto muted (ou segunda linha).

| Caso | Hint |
|------|------|
| `due < hoje` | `há N dia(s)` (`N = hoje − due`) |
| `due === hoje` | `hoje` |
| `due > hoje` | `em N dia(s)` |

Aplicar na tabela Contas fixas / Vencidas **e** no meta da lista “Próximos vencimentos” (Visão geral), no mesmo formato.

---

## Filtro rápido (Contas fixas)

Chips abaixo da barra de busca/categoria (só `section=contas-fixas`):

| Chip | Filtro |
|------|--------|
| Todas | sem filtro de status |
| Vence em 7 dias | `due_today` \| `due_soon` |
| A vencer | `open` |
| Vencidas | `overdue` |

- Estado local (não precisa de query param na v1).
- Empty com filtro ativo (e há itens no catálogo sem o filtro): título “Nenhum resultado”, CTA limpar filtros — **não** o empty de cadastro “Nova conta”.
- Empty real (catálogo vazio): mantém CTA “Nova conta”.

Visão geral e Vencidas: **sem** chips (Vencidas já é filtro fixo).

---

## Código

| Peça | Ação |
|------|------|
| `src/lib/payablesAggregate.js` | `due_today` em `classifyPayableStatus`; summary soma today+soon |
| `src/lib/payablesStatusDisplay.js` | **novo** — `payableStatusLabel`, `payableStatusBadgeClass`, `payableDueRelativeHint` |
| `PayablesTab.jsx` | usar helper; chips; hint na coluna; empty com filtro |
| `PayablesVisaoPanel.jsx` | usar helper (e hint opcional) |
| `src/test/payablesAggregate.test.js` | casos `due_today` + summary |
| Fluxo `a-pagar-contas-fixas.md` | checklist / mapa se copy de status mudar |

Consumidores de `item.status === 'due_soon'` (ex.: testes, recepção): garantir que “hoje” não quebre buckets — recepção já usa `today`/`week`/`overdue` próprios; se algum filtro client depender só de `due_soon`, incluir `due_today`.

---

## Aceite

- [x] Conta com `due === hoje` mostra badge **Vence hoje** (não “Vence em breve”)
- [x] Conta com `due` em 2–7 dias: **Vence em breve**; >7 dias: **A vencer**; `< hoje`: **Vencida**
- [x] Coluna vencimento mostra hint relativo coerente
- [x] Chip “Vence em 7 dias” lista today + soon; “A vencer” só `open`; “Vencidas” só overdue
- [x] KPI `dueSoonCount` inclui vencimentos de hoje
- [x] Empty com filtro ativo não sugere “Nova conta” como se não houvesse cadastro
- [x] Tab e Visão usam o mesmo helper de rótulos
- [x] Testes unitários cobrem `due_today` e summary
- [x] Fluxo `docs/flows/financeiro/a-pagar-contas-fixas.md` atualizado no mesmo PR
