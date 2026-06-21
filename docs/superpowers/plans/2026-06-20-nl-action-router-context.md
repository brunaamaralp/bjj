# NL Action Router Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir custo e latencia do `nlActionHandler` respondendo consultas estruturadas sem LLM e podando o contexto enviado ao LLM por dominio.

**Architecture:** O plano introduz um roteador deterministico leve dentro de `nlActionHandler` e reaproveita `answerAcademyQuery()` para as consultas read-only conhecidas. Para o restante, o handler passa a inferir dominio (`finance`, `students`, `inventory`, `cross_domain`) e monta apenas os blocos de contexto necessarios antes de cair no fluxo atual da Anthropic.

**Tech Stack:** Node.js, Appwrite (`node-appwrite`), Vitest, handlers server-side existentes em `lib/server`.

---

### Task 1: Cobrir o roteador deterministico com TDD

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\nlAction.test.js`
- Reference: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlAcademyQuery.test.js`

- [ ] **Step 1: Escrever o teste falho para query deterministica sem LLM**

```js
it('retorna unpaid_tuition sem chamar Anthropic quando a pergunta eh estruturada', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  const res = await runNlAction({
    text: 'Quem nao pagou este mes?',
    academyId: 'acad-1',
    context: 'financeiro',
  });

  expect(res.status).toBe(200);
  expect(res.body.action).toBe('academy_query');
  expect(res.body.query_type).toBe('unpaid_tuition');
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npm test -- src/test/nlAction.test.js`
Expected: FAIL porque o handler ainda monta prompt completo e cai no LLM.

- [ ] **Step 3: Adicionar caso falho para `quantos alunos ativos`**

```js
it('retorna active_students_count sem chamar Anthropic', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  const res = await runNlAction({
    text: 'Quantos alunos ativos temos hoje?',
    academyId: 'acad-1',
  });

  expect(res.status).toBe(200);
  expect(res.body.action).toBe('academy_query');
  expect(res.body.query_type).toBe('active_students_count');
  expect(res.body.count).toBeTypeOf('number');
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Rodar novamente para manter o RED**

Run: `npm test -- src/test/nlAction.test.js`
Expected: FAIL nos dois casos novos.

- [ ] **Step 5: Commit**

```bash
git add src/test/nlAction.test.js
git commit -m "test: cover deterministic nl-action queries"
```

### Task 2: Extrair roteador leve e resposta direta

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlActionHandler.js`
- Reference: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlAcademyQuery.js`

- [ ] **Step 1: Escrever o helper de match estruturado**

```js
function matchStructuredNlQuery(text) {
  const queryType = inferAcademyQueryType(text);
  if (['unpaid_tuition', 'overdue_tuition', 'missed_experimental', 'attended_experimental', 'checkins_today'].includes(queryType)) {
    return { kind: 'academy_query', queryType };
  }
  if (/quant(os|as)\s+alunos?\s+ativos?|qtos?\s+alunos?\s+ativos?/.test(String(text || '').toLowerCase())) {
    return { kind: 'active_students_count', queryType: 'active_students_count' };
  }
  return null;
}
```

- [ ] **Step 2: Inserir retorno antecipado antes da montagem do prompt completo**

```js
const directMatch = matchStructuredNlQuery(text);
if (directMatch?.kind === 'academy_query') {
  const out = await answerAcademyQuery(databases, {
    academyId,
    queryType: directMatch.queryType,
    referenceMonth: currentMonth,
  });
  return res.status(200).json({
    action: 'academy_query',
    query_type: out.query_type,
    ...out,
  });
}
```

- [ ] **Step 3: Implementar `active_students_count` sem LLM**

```js
if (directMatch?.kind === 'active_students_count') {
  const students = await listAcademyStudentsMapped(academyId);
  const active = filterActiveStudents(students);
  return res.status(200).json({
    action: 'academy_query',
    query_type: 'active_students_count',
    count: active.length,
    resposta: `${active.length} aluno(s) ativos no momento.`,
    rows: [],
  });
}
```

- [ ] **Step 4: Rodar o teste para verificar o GREEN**

Run: `npm test -- src/test/nlAction.test.js`
Expected: PASS nos casos determinísticos sem chamadas ao `fetch` da Anthropic.

- [ ] **Step 5: Commit**

```bash
git add lib/server/nlActionHandler.js src/test/nlAction.test.js
git commit -m "feat: add deterministic router for nl-action"
```

### Task 3: Inferir dominio e podar enriquecimento de contexto

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlActionHandler.js`
- Reference: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlActionContextFetch.js`

- [ ] **Step 1: Criar inferencia leve de dominio**

```js
function inferNlQueryDomain(text, explicitContext = '') {
  const t = String(text || '').toLowerCase();
  if (/(estoque|produto|margem|vendeu|saldo)/.test(t)) return 'inventory';
  if (/(mensalidade|pagou|inadimpl|caixa|recebimento|transa)/.test(t)) return 'finance';
  if (/(aluno|matricul|check-?in|presenca|compareceu|faltou)/.test(t)) return 'students';
  if (explicitContext === 'perfil') return 'cross_domain';
  return 'cross_domain';
}
```

- [ ] **Step 2: Trocar `showFinance/showFunnel` por flags derivadas do dominio**

```js
const queryDomain = inferNlQueryDomain(text, normalizedContext);
const needsFinance = queryDomain === 'finance' || queryDomain === 'cross_domain';
const needsStudents = queryDomain === 'students' || queryDomain === 'cross_domain';
const needsInventory = queryDomain === 'inventory' || queryDomain === 'cross_domain';
const needsFunnel = needsStudents && /(funil|experimental|lead|compareceu|faltou)/.test(String(text || '').toLowerCase());
```

- [ ] **Step 3: Enriquecer apenas os dominios necessarios**

```js
const enriched = await enrichNlActionContext(databases, {
  academyId,
  showFinance: needsFinance,
  showFunnel: needsFunnel,
  clientPending: needsFinance ? pendingTransactionsRaw : [],
  clientPayments: needsFinance ? recentPaymentsRaw : [],
  clientStages: needsFunnel ? pipelineStagesRaw : [],
  referenceMonth: currentMonth,
});

const stockProductsNorm = needsInventory
  ? catalogProductsForNl((Array.isArray(stockProductsRaw) ? stockProductsRaw : []).slice(0, 220))
  : [];
```

- [ ] **Step 4: Rodar o teste existente e validar que o handler continua funcional**

Run: `npm test -- src/test/nlAction.test.js`
Expected: PASS sem regressões nos casos existentes.

- [ ] **Step 5: Commit**

```bash
git add lib/server/nlActionHandler.js src/test/nlAction.test.js
git commit -m "refactor: scope nl-action context by domain"
```

### Task 4: Modularizar o prompt por bloco de dominio

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlActionHandler.js`

- [ ] **Step 1: Extrair builders pequenos para listas de contexto**

```js
function buildStudentList(students) {
  return (Array.isArray(students) ? students : [])
    .slice(0, 100)
    .map((s) => `- ${s.name} (id: ${s.id}, plano: ${s.plan || 'não informado'})`)
    .join('\n');
}

function buildLeadList(leads) {
  return (Array.isArray(leads) ? leads : [])
    .slice(0, 100)
    .map((l) => `- ${l.name} (id: ${l.id}, status: ${l.status || 'não informado'}, etapa: ${l.pipelineStage || 'não informada'})`)
    .join('\n');
}
```

- [ ] **Step 2: Montar `systemPrompt` apenas com blocos necessarios**

```js
const promptBlocks = [
  `Academia: ${String(academyName || '').trim()}`,
  `Data de hoje: ${today}`,
  `Mês atual: ${currentMonth}`,
  `Contexto solicitado: ${normalizedContext || queryDomain}`,
];

if (needsStudents) promptBlocks.push(`Alunos cadastrados:\n${studentList || 'Nenhum aluno cadastrado'}`);
if (needsFunnel) promptBlocks.push(`Leads no funil:\n${leadList || 'Nenhum lead no funil'}`);
if (needsFinance) promptBlocks.push(`Mensalidades do mês:\n${paymentLinesForNl || 'Nenhum registro visível'}`);
if (needsFinance) promptBlocks.push(`Transações pendentes:\n${pendingTxLines || 'Nenhuma transação pendente'}`);
if (needsInventory) promptBlocks.push(`Produtos do estoque:\n${stockProductLines || 'Nenhum produto enviado'}`);

const systemPrompt = `${baseInstructions}\n\n${promptBlocks.join('\n\n')}\n\n${actionInstructions}`;
```

- [ ] **Step 3: Preservar `cross_domain` como fallback completo**

```js
if (queryDomain === 'cross_domain') {
  // manter os mesmos blocos amplos do comportamento atual
}
```

- [ ] **Step 4: Rodar o teste alvo**

Run: `npm test -- src/test/nlAction.test.js`
Expected: PASS com prompt ainda válido para o fluxo LLM.

- [ ] **Step 5: Commit**

```bash
git add lib/server/nlActionHandler.js
git commit -m "refactor: build nl-action prompt from domain blocks"
```

### Task 5: Cobrir o roteador e a poda de contexto com testes dedicados

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\nlAction.test.js`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlAcademyQuery.test.js`

- [ ] **Step 1: Adicionar teste de dominio `finance` sem estoque**

```js
it('envia prompt sem bloco de estoque para query financeira aberta', async () => {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({
      content: [{ type: 'text', text: '{"action":null,"error":"x"}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  });
  vi.stubGlobal('fetch', fetchSpy);

  await runNlAction({
    text: 'Resuma a situacao financeira deste mes',
    academyId: 'acad-1',
    stockProducts: [{ id: 'p1', display_label: 'Kimono A1' }],
  });

  const payload = JSON.parse(fetchSpy.mock.calls[0][1].body);
  expect(payload.system).not.toMatch(/Produtos do estoque/i);
});
```

- [ ] **Step 2: Adicionar teste de dominio `inventory` sem alunos**

```js
it('envia prompt sem bloco de alunos para query de estoque aberta', async () => {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({
      content: [{ type: 'text', text: '{"action":"inventory_query","confidence":"high","data":{"query_type":"stock_level"},"summary":"ok","missing":[],"warnings":[]}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  });
  vi.stubGlobal('fetch', fetchSpy);

  await runNlAction({
    text: 'Como esta o saldo do estoque de kimonos?',
    academyId: 'acad-1',
    students: [{ id: 's1', name: 'Joao' }],
  });

  const payload = JSON.parse(fetchSpy.mock.calls[0][1].body);
  expect(payload.system).not.toMatch(/Alunos cadastrados/i);
});
```

- [ ] **Step 3: Rodar a bateria focal**

Run: `npm test -- src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js`
Expected: PASS.

- [ ] **Step 4: Fazer uma checagem adicional de diagnósticos**

Run: `npm test -- src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js && npm test -- lib/server/claudeClient.test.js`
Expected: PASS nas suites alvo e sem regressão imediata no wrapper comum.

- [ ] **Step 5: Commit**

```bash
git add src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js lib/server/nlActionHandler.js
git commit -m "test: verify nl-action routing and context pruning"
```

### Task 6: Verificacao final

**Files:**
- Review: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlActionHandler.js`
- Review: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\nlAction.test.js`
- Review: `c:\Users\Usuario\Desktop\JIU JITSU\lib\server\nlAcademyQuery.test.js`

- [ ] **Step 1: Rodar a verificacao final**

Run: `npm test -- src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js lib/server/claudeClient.test.js`
Expected: PASS (`Test Files ... passed`, `Tests ... passed`).

- [ ] **Step 2: Checar diagnostics nos arquivos alterados**

Run: usar `GetDiagnostics` para `lib/server/nlActionHandler.js`, `src/test/nlAction.test.js` e `lib/server/nlAcademyQuery.test.js`.
Expected: sem diagnostics novos.

- [ ] **Step 3: Revisar o requisito contra a spec**

```md
- [x] roteador leve antes do prompt
- [x] consultas deterministicas do Top 6 sem LLM
- [x] contexto por dominio para queries abertas
- [x] fallback atual preservado para sem-match
```

- [ ] **Step 4: Commit final**

```bash
git add lib/server/nlActionHandler.js src/test/nlAction.test.js lib/server/nlAcademyQuery.test.js
git commit -m "feat: optimize nl-action routing and prompt context"
```
