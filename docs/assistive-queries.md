# Barra de perguntas (⌘K / Ctrl+K)

Assistente em linguagem natural: **Faça uma pergunta…** na barra superior ou ⌘K.

Fluxo: [`NlCommandBar.jsx`](../src/components/NlCommandBar.jsx) → `/api/agent?route=nl-action` → [`nlActionHandler.js`](../lib/server/nlActionHandler.js).

- **Consultas** (`academy_query`, `inventory_query`): resposta imediata + lista com links.
- **Comandos** (ex.: registrar pagamento): pedem **Confirmar** antes de gravar.

Requisito: `ANTHROPIC_API_KEY` configurada no servidor.

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

Registrar pagamento, venda, despesa, ajuste de estoque, liquidar transação pendente, editar mensalidade, atualizar aluno, check-in, nota.

### Funil

Compareceu / não compareceu, matricular, perder lead, agendar experimental, mover etapa, criar lead, registrar WhatsApp, nota.

Comandos de funil não rodam no contexto exclusivo do Caixa; comandos financeiros não rodam no contexto exclusivo do Funil. Consultas read-only funcionam em qualquer tela.

---

## Ainda não suportado

- Status de pagamento de **um** aluno pelo nome (“João está em dia?”)
- Tarefas atrasadas
- Histórico de check-in (“quem veio hoje?”)
- Cancelar / estornar venda
- Importação de planilha / conciliação bancária

---

## Extensão

Novos tipos de pergunta: case em [`nlAcademyQuery.js`](../lib/server/nlAcademyQuery.js), prompt em [`nlActionHandler.js`](../lib/server/nlActionHandler.js), chip opcional em `NlCommandBar.jsx`.
