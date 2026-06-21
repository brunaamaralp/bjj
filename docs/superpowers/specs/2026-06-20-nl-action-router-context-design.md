# NL Action Router And Context Pruning

## Objetivo

Reduzir custo e latencia do `nlActionHandler` evitando chamadas desnecessarias ao LLM para consultas estruturadas conhecidas e, quando o LLM ainda for necessario, enviar apenas o contexto do dominio relevante.

## Problema Atual

Hoje o `nlActionHandler`:

- monta listas completas de alunos e leads logo no inicio
- enriquece contexto financeiro e de funil antes de saber se a pergunta precisa disso
- injeta um `systemPrompt` grande com alunos, leads, etapas, transacoes, mensalidades e estoque mesmo para perguntas simples

Isso aumenta custo de tokens e mistura contexto irrelevante para consultas como:

- quem nao pagou
- quem faltou na experimental
- quantos alunos ativos
- quem fez check-in hoje

## Escopo Desta Entrega

### Roteador deterministico inicial

Adicionar um roteador leve no `nlActionHandler`, antes da montagem do prompt completo, cobrindo estas consultas:

- `unpaid_tuition`
- `overdue_tuition`
- `missed_experimental`
- `attended_experimental`
- `active_students_count`
- `checkins_today`

### Reducao de contexto para queries nao deterministicas

Para consultas que ainda seguirem para o LLM, carregar contexto por dominio:

- `finance`: pagamentos, transacoes pendentes e planos financeiros
- `students`: alunos e, quando necessario, leads/funil
- `inventory`: produtos de estoque
- `cross_domain`: contexto completo atual

## Fora De Escopo

- substituir todo o parser NL atual
- cobrir todas as consultas estruturadas existentes na primeira entrega
- alterar o formato de resposta das queries existentes
- mudar regras de negocio das acoes ja suportadas

## Reaproveitamento De Codigo

### Consultas existentes

Reaproveitar funcoes ja existentes em `lib/server/nlAcademyQuery.js`:

- `answerAcademyQuery()` para `unpaid_tuition`, `overdue_tuition`, `missed_experimental`, `attended_experimental` e `checkins_today`
- `inferAcademyQueryType()` como apoio, sem depender exclusivamente dele

Reaproveitar `listAcademyStudentsMapped()` + `filterActiveStudents()` para `active_students_count`.

### Consultas de estoque

Continuar usando o fluxo atual de `inventory_query`, mas sem injetar contexto de alunos/financeiro quando o dominio for apenas estoque.

## Design

### 1. Roteador leve antes do prompt

Criar no `nlActionHandler` um bloco inicial equivalente a:

- normalizar a pergunta
- tentar `matchStructuredQuery(text)`
- se houver match deterministico, executar consulta direta e retornar `200`
- se nao houver match, seguir para classificacao de dominio e fluxo LLM atual

O roteador deve ser barato:

- regex e heuristicas simples
- sem chamar LLM
- sem depender de listas enormes do body

### 2. Dominio da consulta

Criar inferencia leve de dominio:

- `finance`
- `students`
- `inventory`
- `cross_domain`

Sinais esperados:

- `finance`: pagamento, mensalidade, inadimplencia, caixa, recebimento
- `students`: alunos, matriculas, check-in, compareceu, faltou
- `inventory`: estoque, produto, margem, vendeu, saldo
- `cross_domain`: quando houver mistura relevante de dominios ou ambiguidade

### 3. Enriquecimento condicional

Substituir o enriquecimento atual de contexto completo por carregamento condicional:

- `finance`:
  - `pendingTransactions`
  - `recentPayments`
  - `financePlans`
- `students`:
  - `students`
  - `leads` apenas se a pergunta tocar funil/experimental
  - `pipelineStages` apenas se houver funil
- `inventory`:
  - `stockProducts`
- `cross_domain`:
  - manter o comportamento atual

### 4. Prompt modular

O `systemPrompt` deve ser montado por blocos condicionais:

- bloco base comum
- bloco financeiro apenas quando necessario
- bloco alunos/funil apenas quando necessario
- bloco estoque apenas quando necessario

Assim, o fallback do LLM continua o mesmo, mas com payload menor.

## Fluxos

### Consulta deterministica

1. Usuario envia pergunta
2. `matchStructuredQuery()` reconhece intent
3. Handler executa consulta direta
4. Responde sem Anthropic

### Consulta aberta

1. Usuario envia pergunta
2. Roteador nao encontra match
3. `inferNlQueryDomain()` escolhe dominio
4. Handler carrega apenas contexto relevante
5. Prompt atual segue para o LLM
6. Validacoes e fallback atuais permanecem

## Fallback E Resiliencia

- se a consulta deterministica falhar por erro interno, logar e cair no fluxo atual do LLM
- se o dominio ficar ambiguo, usar `cross_domain`
- se a pergunta nao casar com nenhum padrao conhecido, manter o comportamento atual

## Testes

Adicionar cobertura para:

- match do roteador para os 6 casos iniciais
- retorno direto sem LLM nas queries deterministicas
- dominio `finance` sem carregar contexto de estoque
- dominio `inventory` sem carregar contexto de alunos/financeiro
- pergunta ambigua caindo em `cross_domain`
- pergunta sem match caindo no fluxo atual

## Resultado Esperado

- menor custo medio por chamada no `nlActionHandler`
- menor latencia em perguntas estruturadas
- menor tamanho de prompt em queries abertas de dominio unico
- preservacao do comportamento atual como fallback
