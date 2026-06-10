# Dashboard — faixa de retornos (UX/UI)

**Data:** 2026-06-10  
**Status:** Aprovado para implementação  
**Abordagem:** A — remover aniversariantes + grid 2 colunas

---

## 1. Objetivo

Simplificar a faixa inferior do Dashboard (retornos / saúde / aniversariantes), eliminar redundância com o hero e deixar a interface mais profissional sem aumentar a carga cognitiva.

### Critérios de sucesso

- Coluna fixa de aniversariantes removida; detalhes acessíveis via hero + modal
- Grid desktop em 2 colunas: retornos (~65%) + saúde (~35%)
- Painel Saúde não lista nomes já visíveis em Retornos pendentes
- Hint de IA não ocupa espaço permanente na lista
- Ações IA agrupadas em menu compacto por linha (WA + concluir permanecem visíveis)

---

## 2. Contexto atual

| Bloco | Comportamento |
|-------|---------------|
| Retornos pendentes | Lista acionável com grupos por temperatura, hint fixo, 4 botões/linha |
| Saúde dos retornos | Contadores + D+1 + lista de nomes (cooling/critical) |
| Aniversariantes hoje | Terceira coluna; vazia na maior parte do tempo |
| Hero | Banner contextual + prioridade do dia para aniversários |

**Problema:** aniversariantes triplicados; saúde repete nomes da lista de retornos; terceira coluna desperdiça ~300px.

---

## 3. Escopo

### Dentro

- Remover seção `#birthdays` e CSS/grid de 3 colunas
- Modal de aniversariantes (2+) acionado pelo banner do hero
- Prioridade do dia e banner apontam para hero/modal (não mais `#birthdays`)
- `FollowupHealthPanel`: telemetria compacta; lista de nomes só quando `followUps.length === 0`
- Hint IA: primeira visita + botão `?` no cabeçalho de retornos
- `FollowupCopilotButtons`: modo `menu` no dashboard (dropdown IA)
- Estilo editorial nos cabeçalhos de grupo (`fu-group__head` com barra lateral)

### Fora

- Saudação personalizada no hero
- Novo bloco no lugar de aniversariantes (matrículas, tarefas, etc.)
- Alteração de lógica de temperatura, templates ou automações

---

## 4. Layout alvo

```
┌─────────────────────────────────────────────┬──────────────────────┐
│  Retornos pendentes                    [n]  │  Saúde dos retornos  │
│  [?]                                        │  pills 🟢 🟠 🔴      │
│  ┌─ grupo (barra lateral) ─────────────┐   │  D+1 barra + %       │
│  │ linha: meta + [IA▾] [WA] [✓]       │   │  (sem nomes se lista │
│  └────────────────────────────────────┘   │   de retornos > 0)   │
└─────────────────────────────────────────────┴──────────────────────┘
```

Mobile: saúde como faixa horizontal acima da lista; retornos full-width.

---

## 5. Fluxos de aniversário

| Gatilho | Ação |
|---------|------|
| Banner hero (1 aluno) | WA inline no banner |
| Banner hero (2+) | Abre `DashboardBirthdayModal` |
| Prioridade do dia (aniversário) | Scroll suave ao banner; se 2+, abre modal |
| `scrollTarget` em briefing | `'birthday-banner'` (substitui `'birthdays'`) |

Turma e parabéns por WA permanecem no modal. Lista em `/alunos` inalterada.

---

## 6. Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Dashboard.jsx` | Remove coluna; modal; hint; props saúde; copilot menu |
| `src/components/dashboard/DashboardBirthdayModal.jsx` | Novo |
| `src/components/dashboard/DashboardBirthdayBanner.jsx` | `onOpenList` em vez de scroll |
| `src/components/dashboard/FollowupHealthPanel.jsx` | `showLeadList`, pills, barra D+1 |
| `src/components/followup/FollowupCopilotButtons.jsx` | `menuMode` |
| `src/lib/dashboardDayBriefing.js` | `scrollTarget: 'birthday-banner'` |
| `src/styles/dashboard.css` | Grid 2 colunas, grupos, saúde, modal |
| `src/test/dashboardDayBriefing.test.js` | Atualizar expectativa de scroll |

---

## 7. Testes manuais

1. Sem aniversariantes: grid 2 colunas, sem coluna vazia
2. 1 aniversariante: banner no hero + prioridade; sem modal automático
3. 2+ aniversariantes: banner → modal com turma e WA
4. Retornos com itens: saúde sem lista de nomes duplicada
5. Retornos vazios com leads críticos no funil: saúde mostra alerta com nomes
6. Hint IA: aparece na 1ª visita; `?` reabre; dismiss persiste em localStorage
7. Menu IA: Resumo e Rascunho funcionam; WA e concluir visíveis
