# Catraca — retenção mais legível + KPIs com filtro

**Data:** 2026-08-05  
**Status:** aprovado (abordagem 1 — brainstorming)  
**Fluxos:** [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md), [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)

---

## Problema

1. No desktop, a retenção na coluna lateral ao lado do feed fica apertada e difícil de operar.
2. A tabela não deixa óbvio *por que* cada aluno está na fila.
3. KPIs **Em risco** e **Sumidos** do hero levam ao mesmo lugar sem filtrar; **Ativos** permanece só informativo.

## Goals

| # | Meta |
|---|------|
| G1 | Retenção em **largura total abaixo** do feed ao vivo (desktop e mobile) |
| G2 | Cada linha mostra uma **frase pronta** de motivo + ações |
| G3 | Clique em Em risco / Sumidos **rola, filtra e mostra chip** com limpar |
| G4 | Entradas hoje → feed; Ativos → não clicável |
| G5 | Deep link `?section=retencao` continua válido (scroll + opcional filtro) |

## Non-goals

- Lista operacional dos alunos **ativos** (só KPI numérico).
- Mudança na classificação de risco no servidor / regras semanais.
- Sub-aba “Retenção” de volta na tablist.
- Redesign do histórico Control iD.

## Layout

```
[ Hero KPIs: Entradas | Em risco | Sumidos | Ativos ]
[ Sub-abas: Ao vivo | Histórico ]   ← quando Control iD ativo
[ Feed ao vivo ]                    ← section live ou retencao
[ Retenção — largura total ]        ← sempre abaixo do feed (não no histórico)
```

- Remover `desktopSplitLive` / grid `recepcao-presence-grid`.
- Em `section=historico`: só histórico (sem retenção), como hoje.
- Em `section=live` ou `section=retencao`: feed + retenção empilhados.
- `section=retencao`: após montar, scroll até `#retencao` (e aplica filtro se houver).

## Lista de retenção (UI)

Substituir a tabela densa na recepção por **lista de linhas/cards**:

- Nome (+ turma · faixa em meta secundária)
- Badge Em risco / Sumido
- **Frase de motivo** (primária), ex.:
  - Em risco: `Abaixo da meta · 12 dias sem treinar` (incluir `2/3` na frase quando útil: `Abaixo da meta (1/3) · 9 dias sem treinar`)
  - Sumido: `Sumido · 18 dias sem treinar`
- Ações existentes (`AttendanceAtRiskRowActions`) à direita / menu ⋯

Helper puro (testável): `buildAttendanceRetentionReasonPhrase(row)` em `src/lib/` (ou ao lado do core).

Remover KPIs duplicados dentro de `AttendanceAtRiskSection` na recepção (hero já cobre). Manter tooltips acessíveis via `?` no heading ou só nos KPIs do hero.

Filtros turma / faixa permanecem na URL (`ret_turma`, `ret_belt`).

## Filtro por status (KPI)

- Query param: `ret_status=at_risk|absent` (ausente = sem filtro / fila completa).
- Hero:
  - **Em risco** → set `ret_status=at_risk`, garantir section live/retencao (não histórico), scroll `#retencao`
  - **Sumidos** → set `ret_status=absent`, idem
  - **Entradas** → scroll feed (`#` / ref live)
  - **Ativos** → sem `onClick`
- Chip acima da lista: `Filtrando: Em risco` / `Filtrando: Sumidos` + botão limpar (remove `ret_status`).
- Filtragem **client-side** sobre `data.at_risk` por `row.status` normalizado (a API já devolve só a fila operacional; status distingue risco vs sumido).

Deep links existentes (`/?tab=catraca&section=retencao`) continuam; opcionalmente `&ret_status=absent`.

## Dados / API

Sem mudança de contrato obrigatória. Reusar `fetchAttendanceRetention` + `summary` no hero via `onDataLoaded` / `summaryOverride`.

## Arquivos principais

| Arquivo | Mudança |
|---------|---------|
| `RecepcaoCatracaTab.jsx` | Stack vertical; KPI → filtro + scroll; sem split |
| `RecepcaoPresenceHero.jsx` | Passar filtro de status no clique Em risco/Sumidos |
| `AttendanceAtRiskSection.jsx` | Lista com frase; chip filtro; ler `ret_status`; dropar layout sidebar |
| `attendance-at-risk.css` / `dashboard.css` | Estilos lista + chip; remover grid split |
| `src/lib/attendanceRetentionReasonPhrase.js` (novo) | Frase + testes |
| `docs/flows/crm/recepcao-controlid.md` + `hoje-dashboard.md` | Layout e KPI |

## Testes

- Unit: `buildAttendanceRetentionReasonPhrase` (risco com/sem meta, sumido, edge days).
- Unit/hub: deep link / `ret_status` helpers se extraídos.
- Ajustar testes de recepção que assumem split ou section retencao exclusivando o feed.

## Critérios de aceite

1. Desktop ≥960px: feed e retenção **empilhados**, retenção usa largura da página.
2. Linha mostra frase de motivo legível sem cruzar colunas da tabela.
3. Clique Em risco filtra só `at_risk` + chip; Sumidos filtra `absent` + chip; limpar restaura fila.
4. Ativos não é clicável; Entradas rola ao feed.
5. Histórico inalterado; deep link retencao rola até a seção.
