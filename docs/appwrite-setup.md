Appwrite — Tabelas/Coleções e Variáveis Necessárias

Objetivo
- Padronizar as coleções, atributos, índices e variáveis usados pelo BJJ Manager no Appwrite (Banco de Dados e Funções).

Banco de Dados
- Database (DB_ID): 1 banco para todo o app.

Coleções (Collections)
- LEADS_COL (Leads/Interessados)
  - Atributos: name (string), phone (string), type (string), origin (string), status (string), scheduledDate (string YYYY-MM-DD), scheduledTime (string HH:mm), parentName (string), age (string), notes (string JSON), academyId (string)
  - Índices sugeridos: equality em academyId; opcional em status; ordenação por $createdAt (nativa)
- ACADEMIES_COL (Academias)
  - Atributos: ownerId (string), name (string), phone (string), email (string), address (string), quickTimes (array<string> ou string)
  - Índices sugeridos: equality em ownerId
- STOCK_ITEMS_COL (Itens de Estoque)
  - Atributos: nome (string), descricao (string), quantidade_total (integer), quantidade_vendida (integer), quantidade_alugada (integer)
  - Índices sugeridos: full‑text em nome (e opcionalmente descricao) para autocomplete; equality por $id (padrão)
- STOCK_MOVES_COL (Movimentações de Estoque)
  - Atributos: item_estoque_id (string), tipo (string: "entrada" | "saida_venda" | "reversao_venda" etc.), quantidade (number), referencia_id (string), motivo (string), usuario_id (string), $createdAt (padrão)
- SALES_COL (Vendas)
  - Atributos: aluno_id (string|null), total (number), forma_pagamento (string), status (string: "rascunho" | "concluida" | "cancelada"), idempotency_key (string|null), cancelada_em (string ISO), cancel_motivo (string|null)
  - Índices sugeridos: equality em idempotency_key
- SALE_ITEMS_COL (Itens de Venda)
  - Atributos: venda_id (string), item_estoque_id (string), quantidade (number), preco_unitario (number)
- CLASSES_COL (Turmas)
  - Atributos: academyId (string), name (string), days (array<integer 0‑6>), time (string HH:mm), coach (string), capacity (integer)
  - Índices sugeridos: equality em academyId; ordenação por name (opcional)
- TASKS_COL (Tarefas por Turma)
  - Atributos: academyId (string), title (string), dueDate (string YYYY‑MM‑DD), dueTime (string HH:mm), classId (string), studentId (string), studentName (string), status (string: "open" | "done"), notes (string)
  - Índices sugeridos: equality em academyId; range em dueDate (>=, <=)

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

Observação (Funções)
- As funções rodam com APPWRITE_FUNCTION_ENDPOINT/PROJECT_ID/API_KEY injetados pelo Appwrite.
- Adicione DB_ID e os IDs de coleções usados por cada função em "Variables".

Variáveis de Ambiente no Frontend (.env)
- VITE_APPWRITE_ENDPOINT
- VITE_APPWRITE_PROJECT
- VITE_APPWRITE_DATABASE_ID (DB_ID)
- VITE_APPWRITE_LEADS_COLLECTION_ID (LEADS_COL)
- VITE_APPWRITE_ACADEMIES_COLLECTION_ID (ACADEMIES_COL)
- VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID (STOCK_ITEMS_COL)
- VITE_APPWRITE_INVENTORY_MOVE_FN_ID (INVENTORY_MOVE_FN_ID)
- VITE_APPWRITE_SALES_CREATE_FN_ID (SALES_CREATE_FN_ID)
- VITE_APPWRITE_SALES_CANCEL_FN_ID (SALES_CANCEL_FN_ID)
- VITE_APPWRITE_INVENTORY_SEED_KIMONOS_FN_ID (INVENTORY_SEED_KIMONOS_FN_ID) [opcional]
- VITE_APPWRITE_CLASSES_COLLECTION_ID (CLASSES_COL)
- VITE_APPWRITE_TASKS_COLLECTION_ID (TASKS_COL)

Permissões (Recomendado)
- Coleções sensíveis (Leads, Turmas, Tarefas, Vendas, Estoque): restringir a usuários autenticados; usar regras baseadas em academyId/ownerId.
- Funções de Vendas/Estoque: executar apenas para usuários autenticados.

Validações/Restrições (Sugestões)
- Leads: status limitado a valores conhecidos; scheduledDate no formato YYYY‑MM‑DD; scheduledTime HH:mm.
- Estoque: quantidade_* inteiros não negativos.
- Vendas: status enumerado; total >= 0; idempotency_key como string curta.
- Tarefas: status "open" | "done"; dueDate YYYY‑MM‑DD; dueTime HH:mm.
