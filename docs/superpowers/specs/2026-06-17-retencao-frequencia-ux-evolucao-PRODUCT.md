# Retenção por frequência — Evolução UX/UI (pós-MVP)

**Data:** 2026-06-17  
**Status:** rascunho — aguardando aprovação  
**TECH:** [2026-06-17-retencao-frequencia-ux-evolucao-TECH.md](./2026-06-17-retencao-frequencia-ux-evolucao-TECH.md)  
**Contexto:** análise UX/UI da entrega das fases 1–5 do módulo de retenção por frequência (catraca / attendance)

**Fluxos relacionados:**

- [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md)
- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)

**Specs relacionadas (feature base — já implementada):**

- Módulo retenção por frequência (fases 1–5): core `lib/attendanceRetentionCore.js`, fila em `AttendanceAtRiskSection`, perfil, Relatórios → Frequência, automações `absent_student` / `newcomer_at_risk`
- [2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md](./2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md) — integração Control iD (paralela, não bloqueante)
- [2026-06-17-recepcao-navegacao-PRODUCT.md](./2026-06-17-recepcao-navegacao-PRODUCT.md) — hub Recepção (`/` com abas)

**Mock Figma:** não disponível — wireframes ASCII e critérios visuais abaixo.

---

## 1. Inventário — o que já foi corrigido

Pacote de correções **priorizadas** (análise UX de 2026-06-17) — **entregue**:

| # | Correção | Superfície | Evidência no código |
|---|----------|------------|---------------------|
| 1 | Fila visível **sem Control iD** quando attendance configurado | Recepção → Catraca | `RecepcaoCatracaTab.jsx` — `StatusBanner` + `AttendanceAtRiskSection` |
| 2 | Badge no perfil **só quando em risco** (≠ Ativo) | Perfil | `StudentProfile.jsx` — `showAttendanceRiskBadge` + `isAtRiskTableStatus()` |
| 3 | Legenda de status com labels legíveis | Relatórios → Frequência | `ReportsFrequenciaPanel.jsx` — `ATTENDANCE_RISK_LABELS[st]` |
| 4 | Renomear seção **“Retenção por frequência”** | Catraca | `AttendanceAtRiskSection.jsx` |
| 5 | Snooze após ausência (7/14/30 dias, padrão 14) | Modal + API | `AttendanceAbsenceReasonModal`, `studentsHandler`, `retention_snoozed_until` |
| 6 | Ações compactas em menu ⋯ no mobile | Fila operacional | `AttendanceAtRiskRowActions.jsx` |
| 7 | CSS do resumo no perfil (sem inline) | Perfil → Frequência | `student-profile.css` — `.student-freq-risk-summary` |
| 8a | Link no ranking → `/student/:id` | Relatórios | `ReportsFrequenciaPanel.jsx` |
| 8b | Heatmap com empty state quando zero | Relatórios | `HeatmapGrid` em `ReportsFrequenciaPanel.jsx` |
| 8c | Filtros turma/faixa na URL (`freq_turma`, `freq_belt`) | Relatórios | `ReportsFrequenciaPanel.jsx` |
| 9 | CTA **“Abrir fila na recepção”** → `/recepcao` | Relatórios | `ReportsFrequenciaPanel.jsx` |

**Feature base (fases 1–5)** também entregue: classificação de risco, API `attendance-retention` / `attendance-frequency`, badge e aba Frequência no perfil, automações diárias, cron `attendance-retention`.

---

## 2. Problema (o que ainda falta)

O MVP de retenção é **operável**, mas a análise UX identificou **lacunas de descoberta, fechamento de loop e polish** que ainda geram fricção:

1. **Fila operacional escondida no scroll** — com Control iD ativo, feed ao vivo + histórico competem com a tabela de retenção na mesma aba; recepção pode não rolar até a fila.
2. **Ações sem feedback claro** — WhatsApp desabilitado sem telefone só mostra `title`; “Em contato” remove da fila sem explicar como reverter.
3. **Perfil incompleto para edge cases** — aluno trancado/inativo na aba Frequência não explica por que não há avaliação de risco.
4. **Automações desconectadas da operação** — gatilhos de retenção existem, mas não há copy sobre “1 mensagem por ciclo”, preview com aluno matriculado nem atalho para a fila.
5. **Relatórios vs Catraca** — KPIs duplicados sem micro-copy; refresh local redundante com o da página.
6. **Design system** — `AttendanceRiskBadge` e modal de ausência ainda usam estilos inline; alvos de toque no mobile permanecem apertados (~30px).
7. **Acessibilidade do heatmap** — intensidade só por cor; em touch o `title` não ajuda; falta resumo textual.
8. **Descoberta na mesa do dia** — gestor na aba Experimentais não vê contagem de alunos em risco sem ir à Catraca.

**Quem é afetado:** recepcionista (operação diária), owner (visão e automações), suporte (explicar comportamento de snooze / em contato).

**Custo de não resolver:** fila ignorada na hora de pico, recepção achando que “resolveu” ausência antes do snooze existir (já mitigado), automações ativadas sem entender limite de envio, baixa adoção do painel analítico.

---

## 3. Goals

| # | Meta |
|---|------|
| G1 | Recepção encontra a **fila de retenção em ≤2 cliques** em qualquer cenário (com ou sem Control iD) |
| G2 | Toda ação da fila tem **feedback visível** (sucesso, bloqueio, próximo passo) sem depender só de tooltip |
| G3 | Perfil deixa claro **por que** não há badge (trancado, inativo, ativo) |
| G4 | Automações de retenção comunicam **regra de envio** e ligam à fila operacional |
| G5 | Relatórios e Catraca explicam a **diferença operacional vs analítico** sem confundir números |
| G6 | Componentes de risco seguem **tokens CSS** do design system (sem inline crítico) |
| G7 | Heatmap e ações mobile atendem **WCAG mínimo** (contraste + alternativa não-cor + área de toque) |

---

## 4. Non-Goals (esta spec)

| Item | Motivo |
|------|--------|
| Alterar limiares de classificação (7/14/15/60 dias) | Produto estável; mudança exige spec de negócio separada |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| Card completo de retenção na Página Hoje com ações | Escopo futuro; aqui só **mini-indicador** opcional |
| Snooze / em contato editáveis em massa | Operação unitária basta na v1 desta evolução |
| Push notification ou e-mail de retenção | Fora do canal WhatsApp já adotado |
| Figma / redesign completo da Recepção | Polish incremental apenas |
| Auto-desligar aluno após X dias sumido | Decisão de negócio sensível; não incluído |

---

## 5. Personas e user stories

### Recepcionista

**US-R1** — Como recepcionista, quero **ver quantos alunos estão em risco** sem rolar a tela inteira da catraca, para priorizar contato na hora de pico.

**US-R2** — Como recepcionista, quando o aluno **não tem telefone**, quero ver **“Sem telefone”** na linha (não só ícone cinza), para saber que preciso ligar ou pedir número.

**US-R3** — Como recepcionista, após marcar **“Em contato”**, quero entender que o aluno **sai da fila até voltar a treinar** (ou ver como desfazer se errei).

**US-R4** — Como recepcionista no celular, quero **botões com área de toque confortável** (≥44px) no menu de ações.

**US-R5** — Como recepcionista, quero **filtrar a fila por turma/faixa** quando a academia é grande (mesmos filtros já existentes na API).

### Owner / gestor

**US-O1** — Como owner na aba Experimentais, quero um **indicador discreto** “X em risco” com link para a fila, para não esquecer retenção no dia a dia.

**US-O2** — Como owner em Relatórios → Frequência, quero saber que os KPIs são **snapshot do período**, enquanto a Catraca mostra a **fila de hoje**.

**US-O3** — Como owner em Automações, quero ler que **só uma mensagem WhatsApp é enviada por ciclo de ausência**, para não esperar spam diário.

**US-O4** — Como owner, ao ativar automação de aluno sumido, quero um **link para a fila na recepção** para validar quem está entrando no gatilho.

### Aluno / perfil (via recepção)

**US-P1** — Como recepcionista no perfil de aluno **trancado**, na aba Frequência quero ver **“Trancado — frequência não avaliada”** em vez de tela vazia ou só stats zerados.

**US-P2** — Como recepcionista, se o badge já está no header, a aba Frequência pode mostrar **detalhe sem repetir o mesmo badge** (reduzir ruído).

---

## 6. Requisitos por prioridade

### P0 — Clareza operacional (fechamento de loop)

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-01 | Feedback **“Sem telefone”** quando WA desabilitado | Texto ou chip visível na coluna de ações; `title` permanece como reforço |
| R-02 | Toast ou hint após **“Em contato”** explicando remoção da fila | Copy: “Sai da fila até novo check-in ou até você limpar em contato no perfil” (ver R-03) |
| R-03 | Ação **“Limpar em contato”** no perfil (ou menu ⋯ da fila) | `POST retention-action` com `clear_contact`; aluno volta à fila se ainda elegível; evento na timeline |
| R-04 | Mensagem na aba Frequência para **trancado / inativo** | `StatusBanner` info quando `isFreezeActive` ou não `isActiveStudent` |

### P1 — Descoberta e navegação

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-05 | **Sub-aba ou ancora “Retenção”** na Catraca quando Control iD ativo | `?tab=catraca&section=retencao` OU terceira sub-aba ao vivo \| histórico \| retenção; scroll automático para `#retencao` |
| R-06 | **Mini-KPI na mesa** (aba Experimentais) | Chip/card: “N em risco” + link `/?tab=catraca&section=retencao`; só se `attendance` configurado e N>0 |
| R-07 | Filtros **turma/faixa na fila** | Toolbar acima da tabela; repassa para `fetchAttendanceRetention`; persistência opcional `ret_turma` / `ret_belt` na URL |
| R-08 | Automações: copy **“1 mensagem por ciclo de ausência”** | Texto de ajuda sob `absent_student` e `newcomer_at_risk` em `AutomacoesSection` |
| R-09 | Automações: **preview com aluno matriculado** | `AutomationPreviewLeadPicker` prioriza students ativos ou fixture “Aluno exemplo (matrícula)” para gatilhos de retenção |
| R-10 | Automações: link **“Ver fila na recepção”** quando gatilho ativo | `Link` para `/?tab=catraca&section=retencao` |

### P2 — Polish, a11y e design system

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-11 | **Micro-copy KPIs** Catraca vs Relatórios | Lead na Catraca: “Fila de ação de hoje”; em Relatórios: “Panorama do período selecionado” |
| R-12 | Remover ou fundir **“Atualizar”** duplicado em Relatórios → Frequência | Preferência: remover botão local se toolbar global já atualiza; ou renomear para “Atualizar frequência” |
| R-13 | `AttendanceRiskBadge` **sem estilos inline** | Classes em `attendance-at-risk.css`; tokens DS para cores por variante |
| R-14 | Modal ausência: classes CSS em vez de inline | `attendance-absence-modal` no mesmo CSS |
| R-15 | Heatmap: **resumo textual** abaixo do grid | Ex.: “Total 12 semanas: 340 check-ins; pico terça-feira” |
| R-16 | Heatmap: legenda de intensidade com **rótulos** (Baixa → Alta) | Não depender só de cor |
| R-17 | Mobile: ações com **min-height 44px** nos controles tocáveis | Menu ⋯ e WA no breakpoint ≤767px |
| R-18 | Perfil: **deduplicar** badge header vs aba Frequência | Se badge no header, aba mostra só métricas (último treino, dias, gráfico futuro) |
| R-19 | Snooze **rápido** sem motivo (opcional) | Ação “Ocultar da fila…” no menu ⋯ com mesmas durações; não substitui registro de ausência com motivo |

---

## 7. Wireframes ASCII (referência)

### Catraca — sub-aba Retenção (R-05)

```
[ Ao vivo ] [ Histórico ] [ Retenção ● ]
────────────────────────────────────────
 Retenção por frequência        [Atualizar]
 KPIs: Ativos | Em risco | Sumidos | Novatos
 [ Turma ▼ ] [ Faixa ▼ ]
 ┌──────────────────────────────────────┐
 │ Aluno │ Dias │ Status │ Ações       │
 └──────────────────────────────────────┘
```

### Mesa Experimentais — mini-KPI (R-06)

```
┌─────────────────────────────────┐
│ ⚠ 12 alunos em risco de churn   │
│    Ver fila na catraca →        │
└─────────────────────────────────┘
```

### Linha sem telefone (R-01)

```
[ WA (disabled) ]  Sem telefone   [ ⋯ ]
```

---

## 8. Success metrics

| Tipo | Métrica | Alvo (30 dias pós-release) |
|------|---------|----------------------------|
| Leading | Cliques no CTA Recepção a partir de Relatórios | ≥20% dos owners que abrem Frequência |
| Leading | Uso de “Em contato” + snooze vs abandono da fila | Redução de reabertura do mesmo aluno na mesma semana |
| Leading | Tempo até primeira ação WA na fila (sessão) | Mediana < 60s após abrir aba Retenção |
| Lagging | Retenção de alunos que voltaram após contato | Baseline a definir com dados reais |
| Qualidade | Zero regressões em `tests/unit/attendance/` | 100% verde no CI |

---

## 9. Fases de entrega sugeridas

| Fase | Escopo | Esforço estimado |
|------|--------|------------------|
| **E1** | R-01 a R-04 (loop operacional + perfil edge cases) | 1 PR pequeno |
| **E2** | R-05 a R-07 (navegação + filtros fila) | 1 PR médio |
| **E3** | R-08 a R-10 (automações) | 1 PR pequeno |
| **E4** | R-11 a R-19 (polish, a11y, DS) | 1–2 PRs |

Ordem recomendada: **E1 → E2 → E3 → E4**. E2 pode paralelizar com E3 após E1.

---

## 10. Open questions

| # | Pergunta | Dono |
|---|----------|------|
| Q1 | Sub-aba “Retenção” vs ancora `#retencao` na mesma scroll view? | Produto — default proposto: **sub-aba** quando Control iD ativo; só scroll quando sem hardware |
| Q2 | “Limpar em contato” no perfil, na fila ou ambos? | Produto — proposta: **perfil** (aba Frequência) + menu ⋯ da fila |
| Q3 | Mini-KPI na mesa: sempre visível ou só quando N>0? | Produto — proposta: **só quando N>0** |
| Q4 | Snooze rápido sem motivo deve gerar evento na timeline? | Produto — proposta: sim, tipo `attendance_snooze` |
| Q5 | Rota canônica da fila: `/recepcao` ou `/?tab=catraca`? | Eng — alinhar com [recepcao-navegacao-PRODUCT](./2026-06-17-recepcao-navegacao-PRODUCT.md); CTA atual usa `/recepcao` (redirect) |

---

## 11. Governança de docs

Atualizar no mesmo PR de cada fase:

- [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md) — sub-aba Retenção, filtros, snooze rápido
- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md) — mini-KPI E2
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md) — mensagens trancado/inativo, limpar em contato
- [VALIDATION.md](../../flows/VALIDATION.md) — se checklist divergir

---

## 12. Critérios de aceite globais

- [ ] Nenhum novo arquivo em `/api/`
- [ ] Toasts/erros seguem [docs/ux-feedback.md](../../ux-feedback.md)
- [ ] Menus flutuantes usam `src/components/shared/menu` (`navi-menu__*`)
- [ ] Testes unitários para novas funções puras (ex.: copy helpers, URL builders)
- [ ] QA manual: presença manual sem Control iD, com Control iD, perfil trancado, automação ativa + fila vazia
