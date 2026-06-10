# Assistente NL (⌘K / Ctrl+K)

Assistente em linguagem natural: **Pergunte ou descreva uma ação…** na barra superior (topbar) ou ⌘K / Ctrl+K. Uma única entrada para consultas read-only e comandos com confirmação.

Fluxo: [`NlCommandBar.jsx`](../src/components/NlCommandBar.jsx) → `/api/agent?route=nl-action` → [`nlActionHandler.js`](../lib/server/nlActionHandler.js).

- **Consultas** (`academy_query`, `inventory_query`): resposta imediata + lista com links.
- **Comandos** (ex.: registrar pagamento): pedem **Confirmar** antes de gravar (bloqueado se confiança `low` ou campos faltantes).

Requisito: `ANTHROPIC_API_KEY` configurada no servidor.

Contexto enriquecido no servidor via [`nlActionContextFetch.js`](../lib/server/nlActionContextFetch.js): transações pendentes, mensalidades do mês e etapas do funil são buscadas no Appwrite quando a página não envia listas — `settle_transaction` e `update_payment` funcionam de qualquer tela.

---

## Ações automáticas WhatsApp (v1)

O agente de inbox executa ações após cada mensagem processada ([`agentActionExecutor.js`](../lib/server/agentActionExecutor.js)), com política **execute-then-notify**: grava automaticamente com `confidence: high` e sempre cria notificação + tarefa para a equipe conferir.

| Ação | Exemplo no chat |
|------|-----------------|
| Nota na conversa | "Vou viajar duas semanas" |
| Nota no histórico | Aviso operacional do aluno |
| Atualizar cadastro | CPF, nascimento, responsável em mensagens |
| Criar lead | Contato novo com nome e telefone |
| Trancar plano | "Quero trancar 30 dias" + confirmação explícita |

**Configuração (UI):** em **Agente de Atendimento → Personalização e suporte → Ações automáticas no WhatsApp** — interruptor geral + checkboxes por tipo de ação. Salvo em `academies.modules.ai_actions` (`enabled`, `actions[]`).

**Schema Appwrite (rodar antes de ativar em produção):**

| Script | Coleções / atributos |
|--------|----------------------|
| `node scripts/verify-and-fix-schema-integrations.mjs` | `conversations.agent_state`, `conversation_notes`, `note_notifications` (type, severity, action_url) |
| `node scripts/verify-and-fix-schema-crm.mjs` | `lead_events` (auditoria `ai_action`), `tasks` (tarefas `created_by: ai-agent`) |
| `npm run provision:plan-freeze` | `plan_freezes` + campos de trancamento em `leads`/`students` |

Variáveis de ambiente necessárias: `APPWRITE_CONVERSATIONS_COLLECTION_ID`, `APPWRITE_CONVERSATION_NOTES_COLLECTION_ID`, `APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID`, `APPWRITE_LEAD_EVENTS_COLLECTION_ID`, `APPWRITE_TASKS_COLLECTION_ID`, `APPWRITE_PLAN_FREEZES_COLLECTION_ID`.

Assistente ⌘K também suporta `freeze_plan` (trancamento com confirmação na UI).

---

## Perguntas respondidas (somente leitura)

### Alunos, mensalidades e funil (`academy_query`)

| Pergunta exemplo | Tipo |
|------------------|------|
| Quem fez matrícula esse mês? | `enrolled_in_month` |
| Quem ainda não pagou? / inadimplentes | `unpaid_tuition` / `overdue_tuition` |
| Quantos leads novos essa semana? | `new_leads` |
| Quem compareceu à experimental? | `attended_experimental` |
| Quem tem experimental agendada? | `scheduled_experimental` |
| Quem faltou na experimental? | `missed_experimental` |
| Quem perdemos esse mês? | `lost_leads` |
| Quem está em aguardando decisão? | `pipeline_stage` |
| Quanto entrou / faturamento esse mês? | `finance_summary` |
| O João está em dia? | `student_payment_status` |
| Quem veio hoje? | `checkins_today` |
| Tarefas atrasadas | `overdue_tasks` |

Período: cite o mês (“em maio”) ou “essa semana” / “esse mês”. Funil usa semana como padrão quando não especificado.

Links: alunos → `/student/:id`; leads → `/lead/:id`.

### Estoque e vendas (`inventory_query`)

| Pergunta exemplo | Tipo |
|------------------|------|
| O que mais vendeu esse mês? | `top_sellers` |
| Quais produtos estão parados? | `slow_movers` |
| Qual a margem da camisa G? | `margin` (cite o produto) |
| Quanto tenho de rashguard? | `stock_level` |

---

## Comandos (exigem Confirmar)

### Financeiro

Registrar pagamento, venda, despesa, ajuste de estoque, liquidar transação pendente, editar mensalidade, atualizar aluno, trancar plano (`freeze_plan`), check-in, nota.

### Funil

Compareceu / não compareceu, matricular, perder lead, agendar experimental, mover etapa, criar lead, registrar WhatsApp, nota.

Comandos de funil não rodam no contexto exclusivo do Caixa; comandos financeiros não rodam no contexto exclusivo do Funil. Consultas read-only funcionam em qualquer tela.

**WhatsApp (`register_whatsapp`)**: envia template de contato se o módulo WhatsApp estiver ativo; caso contrário, registra apenas no histórico do lead.

---

## Ainda não suportado

- Cancelar / estornar venda (faça manualmente em Vendas)
- Importação de planilha / conciliação bancária

---

## Test plan (staging)

Checklist manual — uma pergunta/comando por tipo:

- [ ] Consulta: quem não pagou
- [ ] Consulta: O [nome] está em dia?
- [ ] Consulta: quem veio hoje
- [ ] Consulta: tarefas atrasadas
- [ ] Comando: registrar pagamento
- [ ] Comando: liquidar transação (fora do Caixa)
- [ ] Comando: editar mensalidade (fora de Mensalidades)
- [ ] Comando: marcar compareceu (Pipeline ou Dashboard)
- [ ] Comando: registrar WhatsApp com módulo ativo
- [ ] Confirmação bloqueada com confiança baixa

Automatizado: `npm test -- --run src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js lib/server/nlActionContextFetch.test.js`

---

## Extensão

Novos tipos de pergunta: case em [`nlAcademyQuery.js`](../lib/server/nlAcademyQuery.js), prompt em [`nlActionHandler.js`](../lib/server/nlActionHandler.js), chip opcional em `NlCommandBar.jsx`.
