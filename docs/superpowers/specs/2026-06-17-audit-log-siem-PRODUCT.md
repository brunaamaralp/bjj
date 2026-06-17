# Log de auditoria unificado (SIEM interno) — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Fase 1 em implementação  
**TECH:** [2026-06-17-audit-log-siem-TECH.md](./2026-06-17-audit-log-siem-TECH.md)  
**Relacionado:** `academy_events`, `lead_events`, `financial_audit_log`, aba Equipe (histórico), timeline lead/aluno

---

## 1. Problem Statement

O Nave grava ações da equipe em **vários lugares** (`academy_events`, `lead_events`, `financial_audit_log`, campos `created_by` nos documentos). Isso impede respostas simples como:

- *Quem concluiu esta tarefa?*
- *Quem registrou vendas ontem?*
- *O que a recepcionista fez na segunda?*

Hoje só dá para inferir abrindo **perfil do lead**, **relatório por operador**, **drawer da tarefa** ou consultando o banco.

**Quem sofre:** titular e administrador que precisam de accountability operacional sem ser desenvolvedor.

**Custo de não resolver:** disputas internas sem evidência; auditoria manual lenta; duplicação de eventos inconsistentes entre módulos.

---

## 2. Visão do produto

Um **log único de auditoria** por academia — estilo SIEM leve — com:

1. **Escrita canônica** no servidor (quem fez, o quê, em quê, quando).
2. **Feed “Atividade da academia”** (Fase 3) com filtros por pessoa, módulo e período.
3. **Projeções** que mantêm UX existente (timeline do lead, histórico da Equipe).

O operador **não** precisa saber que existem coleções diferentes; vê uma narrativa coerente.

---

## 3. Goals por fase

### Fase 1 — Biblioteca de escrita (esta entrega)

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Um ponto de API server `recordAuditEvent()` | Novos eventos de tarefas, notas e vendas passam por ele |
| G2 | Envelope padronizado em `payload_json` + campos indexáveis | `event_type`, `actor_*`, `target_*`, `summary` preenchidos |
| G3 | Compatibilidade com `academy_events` existente | Histórico da Equipe continua funcionando |
| G4 | Sem PII sensível no log | Senhas/tokens nunca gravados (regra já existente) |

### Fase 2 — Adaptadores legados

| # | Objetivo |
|---|----------|
| G5 | `recordFinancialAudit` e `recordAcademyEvent` viram wrappers |
| G6 | `lead_events` como projeção opcional (`projectToLeadTimeline`) |

### Fase 3 — Feed + API

| # | Objetivo |
|---|----------|
| G7 | Tela **Atividade** (Relatórios ou Configurações) |
| G8 | `GET /api/reports?route=audit-feed` com filtros e paginação |
| G9 | Permissões por papel (titular vê tudo; recepcionista vê o próprio) |

### Fase 4 — Higiene

| # | Objetivo |
|---|----------|
| G10 | Registry único `auditEventTypes.js` cobrindo todos os domínios |
| G11 | Export CSV / retenção 90 dias documentada |

---

## 4. Non-Goals

| Item | Motivo |
|------|--------|
| Substituir timeline do lead na UI | Projeção CRM continua; feed é visão transversal |
| Splunk / correlação em tempo real / ML | Complexidade desproporcional |
| Novos arquivos em `/api/` (Fase 1–2) | Limite Vercel Hobby — rotas via `reports.js` / `agent.js` |
| Logs de infra Vercel no mesmo feed | Escopo produto, não DevOps |
| Recalcular histórico antigo em massa | Só eventos novos no formato canônico |

---

## 5. Fase 3 — UX do feed “Atividade” (preview)

**Onde:** Relatórios → aba **Atividade** (ou subseção em Configurações → Equipe).

**Filtros:**

- Período (padrão: últimos 7 dias)
- Pessoa (membro da equipe)
- Módulo: Equipe, Tarefas, Vendas, Financeiro, Inbox, Estoque, CRM

**Lista (exemplo):**

```
09:14  Maria Alice    Tarefas     Concluiu «Ligar para João»
09:02  GBLP           Vendas      Venda R$ 189,00 — Kimono A2
08:55  Sistema        Financeiro  12 mensalidades geradas
08:40  Maria Alice    Inbox       Nota em conversa +55…
```

**Interação:** clique abre deep link (tarefa, venda, lead, conversa).

**Permissões:**

| Papel | Vê |
|-------|-----|
| Titular | Todos os eventos da academia |
| Administrador | Todos exceto ações de segurança do titular (fase posterior) |
| Recepcionista | Apenas eventos em que `actor` é ele mesmo |

---

## 6. Eventos priorizados (Fase 1)

| event_type | Resumo humano |
|------------|----------------|
| `tasks.completed` | {ator} concluiu a tarefa «{título}» |
| `tasks.created` | {ator} criou a tarefa «{título}» |
| `inbox.note_added` | {ator} adicionou nota interna na conversa |
| `sales.created` | {ator} registrou venda de R$ {total} |
| `team_member_*` | (legado) mantém textos atuais da Equipe |

---

## 7. Invariantes

- Todo evento tem `academy_id`, `occurred_at`, `event_type`, `actor_user_id`, `actor_name`.
- `summary` é sempre texto legível em PT-BR (pré-computado no servidor).
- Eventos de `system`, `cron` e `ai-agent` usam `actor.type` correspondente.
- Falha ao gravar auditoria **não** falha a operação principal (fire-and-forget com `console.warn`).

---

## 8. Validação

| Cenário | Resultado esperado |
|---------|-------------------|
| Concluir tarefa com lead vinculado | Documento em `academy_events` com `tasks.completed` + timeline do lead (como hoje) |
| Adicionar nota no Inbox | `inbox.note_added` com autor e `conversation_id` no payload |
| Nova venda | `sales.created` com `target_id` = venda e valor no summary |
| Titular abre Equipe → Histórico | Eventos `team_member_*` inalterados |
| Coleção não configurada | Operação OK; warn no servidor; feed vazio |

---

## 9. Métricas de sucesso (90 dias pós Fase 3)

- Titular encontra “quem fez X” em &lt; 30 s sem suporte.
- 100% dos eventos novos de tarefas/vendas/notas no envelope canônico.
- Zero regressão no histórico da Equipe e na timeline do lead.
