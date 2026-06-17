Appwrite — Tabelas/Coleções e Variáveis Necessárias

Objetivo
- Padronizar as coleções, atributos, índices e variáveis usados pelo BJJ Manager no Appwrite (Banco de Dados e Funções).

Banco de Dados
- Database (DB_ID): 1 banco para todo o app.

Coleções (Collections)
- LEADS_COL (Leads/Interessados — só funil, sem matriculados)
  - Atributos: name, phone, type, origin, status (Novo…Não fechou — não Matriculado), pipeline_stage, scheduledDate, scheduledTime, parentName, **age**, **birth_date**, sexo, **is_first_experience**, academyId, lostReason, whatsapp_*, **label_ids**, custom_answers_json, ai_history_summary_json (cache do Resumo IA), etc.
  - Timestamps de funil (`pipeline_stage_changed_at`, `attended_at`, `lost_at`, `imported_at`, …): tipo **datetime** no Appwrite (manifesto em `scripts/verify-and-fix-schema-crm.mjs`).
  - Índices sugeridos: equality em academyId; opcional em status; ordenação por $createdAt
  - Após migrar alunos para `students`: `npm run cleanup:lead-student-attrs` (dry-run) e depois `DRY_RUN=0 CONFIRM=1 npm run cleanup:lead-student-attrs`
- STUDENTS_COL (Alunos matriculados)
  - Fonte de verdade do schema: `STUDENTS_ATTRS` em `scripts/verify-and-fix-schema-crm.mjs` · verificar/provisionar: `npm run verify-and-fix-schema-crm`
  - Auditoria código × manifesto × live: `npm run audit:students-attrs` (opcional `--sample`)
  - Provisionar legado: `npm run provision:students`
  - Migrar dados legados: `npm run migrate:leads-to-students` (DRY_RUN=1 para prévia)
  - Atributos principais: name, phone, email, type, academyId, **birth_date** (idade derivada na UI — **não** gravar `age`), source_origin, student_status, plan, plan_billing, due_day, enrollmentDate, converted_at, turma, belt, cpf, responsavel, cpf_responsavel, **payer_aliases_json** (pagadores conhecidos / conciliação), preferred_payment_*, emergencyContact/Phone, custom_answers_json, freeze_*, controlid_*, photo_url, collection_snooze_*, overdue/overdue_label, exit_reason, exit_date, etc.
  - **Não** usar em `students`: `age`, `is_first_experience`, `label_ids` (ficam só em leads; na matrícula, `is_first_experience` do funil vira `custom_answers_json.primeira_experiencia`). Remoção live: `npm run cleanup:students-unused-attrs` (dry-run) → `DRY_RUN=0 CONFIRM=1 npm run cleanup:students-unused-attrs`
  - Matrícula pública (`/inscricao/:token`): exige **data de nascimento** para Criança/Juniores; não envia `age`.
  - Índices: academyId, student_status, phone, plan
  - FKs em outras coleções continuam como `lead_id` (mesmo $id do documento)
- ACADEMIES_COL (Academias)
  - Provisionar atributos extras: `npm run provision:academy-attrs` (`settings`, `student_freeze_reasons`, `student_exit_reasons`, `onboardingChecklist`)
  - Atributos: ownerId (string), name (string), phone (string), email (string), address (string), quickTimes (array<string> ou string)
  - Índices sugeridos: equality em ownerId
- TASK_TEMPLATES_COL (Templates de tarefas — processos operacionais)
  - Provisionar: `npm run provision:task-templates`
  - Atributos: `academy_id`, `name`, `trigger`, `items_json` (string[], um JSON com todos os itens), `enabled` (boolean, default true), `created_at`, `updated_at`
  - Gatilhos: `enrollment`, `student_exit`, `student_freeze`, `student_unfreeze`, `student_reactivation`, `student_birthday` (sem cron ainda), `manual`
  - Listagem padrão: só `enabled = true`; configuração usa `?include_disabled=1`
- STOCK_ITEMS_COL (Itens de Estoque — legado; após migração `migrated: true`)
  - Atributos: nome (string), descricao (string), quantidade_total (integer), quantidade_vendida (integer), quantidade_alugada (integer), current_quantity (integer), minimum_level (integer, padrão 0), unit (string), last_updated (datetime), last_checked (datetime), notes (string), academy_id (string), migrated (boolean)
  - Índices sugeridos: full‑text em nome (e opcionalmente descricao) para autocomplete; equality em academy_id
- PRODUCTS_COL (Produto pai — catálogo)
  - Provisionar: `node scripts/provision_products_schema.js` (defina `PRODUCTS_COL`, `PRODUCT_VARIANTS_COL`, `STOCK_ITEMS_COL`)
  - Atributos: name, description, category, sale_price, cost_price, type (`sale`|`supply`|`rental`), is_for_sale, is_active, image_url, academy_id, created_at
- PRODUCT_VARIANTS_COL (Variantes / SKU de estoque)
  - Atributos: product_id, size, color, sku, current_quantity, minimum_level, unit, academy_id, legacy_stock_item_id, is_active, last_updated, notes, **average_cost** (float, default 0), **last_purchase_cost** (float, default 0)
  - Provisionar custo médio + CMV: `npm run provision:inventory-cost`
- STOCK_MOVES_COL (Movimentações de Estoque)
  - Atributos: item_estoque_id (string), tipo (string: "entrada" | "saida_venda" | "reversao_venda" etc.), quantidade (number), referencia_id (string), motivo (string), usuario_id (string), purchase_price (float, opcional em entrada), academy_id (string), $createdAt (padrão)
- ACADEMIES_COL — atributo `settings` (string JSON, até 8k): `stockCheckSchedule` (enabled, dayOfWeek, taskTitle), `stockPurchaseExpenseCategory`
- SALES_COL (Vendas)
  - Atributos: aluno_id (string|null), total (number), forma_pagamento (string), status (string: "rascunho" | "concluida" | "cancelada"), idempotency_key (string|null), cancelada_em (string ISO), cancel_motivo (string|null)
  - Índices sugeridos: equality em idempotency_key
- SALE_ITEMS_COL (Itens de Venda)
  - Atributos: venda_id (string), item_estoque_id (string), product_variant_id (string, opcional — mesmo id da variante), quantidade (number), preco_unitario (number), **cmv** (float, opcional — custo da mercadoria vendida no momento da venda)
- CLASSES_COL (Turmas)
  - Atributos: academyId (string), name (string), days (array<integer 0‑6>), time (string HH:mm), coach (string), capacity (integer)
  - Índices sugeridos: equality em academyId; ordenação por name (opcional)
- TASKS_COL (Tarefas por Turma)
  - Atributos: academyId (string), title (string), dueDate (string YYYY‑MM‑DD), dueTime (string HH:mm), classId (string), studentId (string), studentName (string), status (string: "open" | "done"), notes (string)
  - Índices sugeridos: equality em academyId; range em dueDate (>=, <=)

Schema CRM (manifesto único)
- `npm run verify-and-fix-schema-crm` — LEADS, STUDENTS, TASKS, LEAD_EVENTS, extrato bancário, ACCOUNTS, JOURNAL, etc.
- Coleções com timestamps **datetime** no Appwrite (não `string`): ex. LEADS (`pipeline_stage_changed_at`, `attended_at`, …), TASKS (`updated_at`), LEAD_EVENTS (`at`), JOURNAL (`date`), BANK_STATEMENTS (`import_date`, `completed_at`).
- Spec pagadores conhecidos: `docs/superpowers/specs/2026-06-16-conciliacao-pagadores-conhecidos-TECH.md`

Funções (Functions) e Variáveis de Ambiente (Function Variables)
- Inventário — Movimentar Estoque (INVENTORY_MOVE_FN_ID)
  - Variáveis: DB_ID, STOCK_ITEMS_COL, STOCK_MOVES_COL
- Vendas — Criar (SALES_CREATE_FN_ID)
  - Variáveis: DB_ID, STOCK_ITEMS_COL, STOCK_MOVES_COL, SALES_COL, SALE_ITEMS_COL
  - Usa idempotency_key (opcional) para evitar duplicidade
- Vendas — Cancelar (SALES_CANCEL_FN_ID)
  - Variáveis: DB_ID, STOCK_ITEMS_COL, STOCK_MOVES_COL, SALES_COL, SALE_ITEMS_COL
- Opcional — Seed Kimonos (INVENTORY_SEED_KIMONOS_FN_ID)
  - Variáveis conforme implementação (normalmente DB_ID, STOCK_ITEMS_COL)

API Vercel (estoque)
- `GET /api/inventory/report?from=YYYY-MM-DD&to=YYYY-MM-DD` — relatório de giro / curva ABC (rewrite → `leads.js?route=inventory&report=1`)
- Consulta IA: `POST /api/agent?route=inventory-query` ou NL `inventory_query` (barra de comando)

Observação (Funções)
- As funções rodam com APPWRITE_FUNCTION_ENDPOINT/PROJECT_ID/API_KEY injetados pelo Appwrite.
- Adicione DB_ID e os IDs de coleções usados por cada função em "Variables".

Variáveis de Ambiente no Frontend (.env)
- VITE_APPWRITE_ENDPOINT
- VITE_APPWRITE_PROJECT
- VITE_APPWRITE_DATABASE_ID (DB_ID)
- VITE_APPWRITE_LEADS_COLLECTION_ID (LEADS_COL)
- VITE_APPWRITE_STUDENTS_COLLECTION_ID (STUDENTS_COL)
- VITE_APPWRITE_ACADEMIES_COLLECTION_ID (ACADEMIES_COL)
- VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID (STOCK_ITEMS_COL)
- VITE_APPWRITE_PRODUCTS_COLLECTION_ID (PRODUCTS_COL)
- VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID (PRODUCT_VARIANTS_COL)
- VITE_APPWRITE_INVENTORY_MOVE_FN_ID (INVENTORY_MOVE_FN_ID)
- VITE_APPWRITE_SALES_CREATE_FN_ID (SALES_CREATE_FN_ID)
- VITE_APPWRITE_SALES_CANCEL_FN_ID (SALES_CANCEL_FN_ID)
- VITE_APPWRITE_INVENTORY_SEED_KIMONOS_FN_ID (INVENTORY_SEED_KIMONOS_FN_ID) [opcional]
- VITE_APPWRITE_CLASSES_COLLECTION_ID (CLASSES_COL)
- VITE_APPWRITE_TASKS_COLLECTION_ID (TASKS_COL)

Permissões (Recomendado)
- Coleções sensíveis (Leads, Turmas, Tarefas, Vendas, Estoque): restringir a usuários autenticados; usar regras baseadas em academyId/ownerId.
- Funções de Vendas/Estoque: executar apenas para usuários autenticados.

Billing (assinatura Nave — Asaas)
- Provisionar: `npm run provision:billing`
- Coleções: `store_subscriptions`, `subscription_payments`, `billing_idempotency_keys` (IDs em `APPWRITE_BILLING_*_COLLECTION_ID`)
- `store_subscriptions`: storeId (unique), status, currentPeriodEnd, cancelAtPeriodEnd, asaasCustomerId, asaasSubscriptionId, taxDocumentDigits, planSlug, pendingPlanSlug, billingType
- `subscription_payments`: asaasPaymentId (unique), storeId, value, billingType, paidAt, asaasSubscriptionId
- API consolidada: `/api/billing?action=` (checkout, status, payments, cancel-subscription, change-plan, payment-method-link)

Validações/Restrições (Sugestões)
- Leads: status limitado a valores conhecidos; scheduledDate no formato YYYY‑MM‑DD; scheduledTime HH:mm.
- Estoque: quantidade_* inteiros não negativos.
- Vendas: status enumerado; total >= 0; idempotency_key como string curta.
- Tarefas: status "open" | "done"; dueDate YYYY‑MM‑DD; dueTime HH:mm.
