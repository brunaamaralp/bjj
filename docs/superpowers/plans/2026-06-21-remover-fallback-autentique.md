# Remover Fallback Autentique Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o fallback global do token Autentique no fluxo de contratos e bloquear, com UX clara, operacoes autenticadas para academias sem token proprio.

**Architecture:** A mudanca fica concentrada em tres camadas. No backend, `autentiqueService.ts` deixa de ler `AUTENTIQUE_TOKEN` do ambiente e passa a expor erro de negocio dedicado quando a academia nao tem credencial propria. Em `contractHttp.ts` e no sync de contratos, esse erro ganha tratamento explicito para retornar resposta amigavel e rastreavel. No frontend, a copy da tela de integracoes e as mensagens de erro do fluxo de contratos passam a orientar a configuracao da conta da propria academia.

**Tech Stack:** Node.js, TypeScript, React, React Query, Vitest, Appwrite, handlers server-side em `lib/contracts` e `lib/server`.

---

### Task 1: Cobrir a remocao do fallback e o novo erro de negocio

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\signContract.test.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\humanizeAutentiqueError.test.js`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\appwriteErrors.test.js`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\autentique\autentiqueService.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\autentique\humanizeAutentiqueError.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\lib\errorMessages.js`

- [ ] **Step 1: Escrever o teste falho que impede uso de token global no envio**

```ts
it('falha sem chamar Appwrite quando a academia nao tem token proprio, mesmo com env global', async () => {
  process.env.AUTENTIQUE_TOKEN = 'global-token-que-nao-deve-ser-usado';
  vi.mocked(createDocument).mockRejectedValue(new Error('autentique_not_configured_for_academy'));

  await expect(
    signContract(
      {
        name: 'Contrato sem token',
        academy_id: 'acad-1',
        signers: [{ email: 'aluno@x.com', action: 'SIGN' }],
      },
      Buffer.from('pdf'),
      { settings: JSON.stringify({ autentique: { enabled: true, account_email: '' } }) }
    )
  ).rejects.toThrow('autentique_not_configured_for_academy');

  expect(createContract).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Escrever testes falhos para as mensagens amigaveis**

```js
it('humaniza autentique_not_configured_for_academy', () => {
  expect(humanizeAutentiqueError('autentique_not_configured_for_academy')).toContain(
    'Conecte a conta Autentique da academia'
  );
  expect(isAutentiqueClientError('autentique_not_configured_for_academy')).toBe(true);
});

it('friendlyError traduz autentique_not_configured_for_academy para UX', () => {
  expect(friendlyError('autentique_not_configured_for_academy', 'send')).toContain(
    'Integrações'
  );
});
```

- [ ] **Step 3: Rodar os testes para confirmar o RED**

Run: `npm run test:run -- src/test/signContract.test.ts src/test/humanizeAutentiqueError.test.js src/test/appwriteErrors.test.js`  
Expected: FAIL porque `autentiqueService.ts` ainda aceita `AUTENTIQUE_TOKEN` global e as mensagens novas ainda nao existem.

- [ ] **Step 4: Implementar a remocao do fallback e o novo mapeamento de erro**

```ts
function getApiToken(academyDoc?: Record<string, unknown> | null): string {
  if (academyDoc) {
    const cfg = readAutentiqueConfig(academyDoc.settings ?? academyDoc.settings_json);
    if (cfg.token_encrypted) {
      const decrypted = decryptAutentiqueToken(cfg.token_encrypted).trim();
      if (decrypted) return decrypted;
    }

    const legacyToken = String(academyDoc.autentique_token || '').trim();
    if (legacyToken) return legacyToken;
  }

  throw new Error('autentique_not_configured_for_academy');
}
```

```ts
if (lower === 'autentique_not_configured_for_academy') {
  return 'Conecte a conta Autentique da academia em Integracoes para enviar, sincronizar ou cancelar contratos.';
}
```

```js
autentique_not_configured_for_academy:
  'Conecte a conta Autentique da academia em Integrações para usar contratos digitais.',
```

- [ ] **Step 5: Rodar os testes para verificar o GREEN**

Run: `npm run test:run -- src/test/signContract.test.ts src/test/humanizeAutentiqueError.test.js src/test/appwriteErrors.test.js`  
Expected: PASS cobrindo o bloqueio de fallback e as mensagens novas.

- [ ] **Step 6: Commit**

```bash
git add src/test/signContract.test.ts src/test/humanizeAutentiqueError.test.js src/test/appwriteErrors.test.js lib/autentique/autentiqueService.ts lib/autentique/humanizeAutentiqueError.ts src/lib/errorMessages.js
git commit -m "test: cover academy-only autentique credentials"
```

### Task 2: Bloquear envio, sync e cancelamento com resposta explicita do backend

**Files:**
- Create: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\contractHttp.test.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\contracts\contractHttp.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\lib\contracts\contractAutentiqueSync.ts`

- [ ] **Step 1: Escrever teste falho para envio sem token proprio**

```ts
it('retorna 400 amigavel ao enviar contrato sem token da academia', async () => {
  const form = new FormData();
  form.append('name', 'Contrato');
  form.append('template_id', 'tpl-1');
  form.append('signers', JSON.stringify([{ email: 'aluno@x.com', action: 'SIGN' }]));

  const res = await handlePostContract(form, {
    academyId: 'acad-1',
    userId: 'user-1',
    isOwner: true,
  });

  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.error).toContain('Conecte a conta Autentique da academia');
  expect(body.code).toBe('autentique_not_configured_for_academy');
});
```

- [ ] **Step 2: Escrever testes falhos para sync e cancelamento bloqueados**

```ts
it('retorna 400 no sync sem token proprio', async () => {
  const params = new URLSearchParams('sync=1');
  const res = await handleGetContractById('contract-1', auth, params);
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.code).toBe('autentique_not_configured_for_academy');
});

it('retorna 400 no cancelamento sem token proprio', async () => {
  const res = await handlePatchContract('contract-1', { action: 'cancel' }, auth);
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.code).toBe('autentique_not_configured_for_academy');
});
```

- [ ] **Step 3: Rodar o teste novo para manter o RED**

Run: `npm run test:run -- src/test/contractHttp.test.ts`  
Expected: FAIL porque `contractHttp.ts` ainda devolve 500/404 genericos e `contractAutentiqueSync.ts` nao diferencia falta de configuracao.

- [ ] **Step 4: Implementar tratamento centralizado do erro**

```ts
function isAcademyAutentiqueNotConfigured(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return String(message).trim().toLowerCase() === 'autentique_not_configured_for_academy';
}

function contractAutentiqueNotConfiguredResponse() {
  return jsonResponse(
    {
      ok: false,
      error: 'Conecte a conta Autentique da academia em Integracoes para usar contratos digitais.',
      code: 'autentique_not_configured_for_academy',
    },
    400
  );
}
```

```ts
if (isAcademyAutentiqueNotConfigured(err)) {
  logContractStructured('contract_create_blocked', {
    academy_id: auth.academyId,
    status: 'autentique_not_configured_for_academy',
  });
  return contractAutentiqueNotConfiguredResponse();
}
```

```ts
if (shouldSync) {
  const syncResult = await syncContractFromAutentique(contractId, auth.academyId);
  if (!syncResult.ok && syncResult.error === 'autentique_not_configured_for_academy') {
    return contractAutentiqueNotConfiguredResponse();
  }
}
```

- [ ] **Step 5: Rodar o teste para verificar o GREEN**

Run: `npm run test:run -- src/test/contractHttp.test.ts`  
Expected: PASS com `400` e `code=autentique_not_configured_for_academy` para envio, sync e cancelamento.

- [ ] **Step 6: Commit**

```bash
git add src/test/contractHttp.test.ts lib/contracts/contractHttp.ts lib/contracts/contractAutentiqueSync.ts
git commit -m "feat: block autentique actions without academy token"
```

### Task 3: Ajustar copy e UX do frontend para o novo bloqueio

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\components\academy\ContractsAutentiqueSection.jsx`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\components\contracts\ContractDetailsDrawer.tsx`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\features\contracts\api.ts`
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\src\test\appwriteErrors.test.js`

- [ ] **Step 1: Escrever teste falho para a copy de integracoes**

```js
it('traduz autentique_not_configured_for_academy com CTA para Integrações', () => {
  expect(friendlyError('autentique_not_configured_for_academy')).toContain('Integrações');
});
```

- [ ] **Step 2: Trocar a copy que promete conta padrao**

```jsx
{!configured && statusPhase !== 'error' ? (
  <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
    Sem configurar a conta Autentique da academia, o Nave permite preparar modelos e prévias, mas não envia contratos para assinatura.
  </p>
) : null}
```

- [ ] **Step 3: Padronizar o drawer para usar mensagem amigavel**

```tsx
    } catch (e) {
      addToast({
        type: 'error',
        message: friendlyError(e, 'action'),
      });
    }
```

```ts
if (!res.ok || !data.ok || !data.contract) {
  const parts = [data.error, data.detail].filter(Boolean);
  throw new Error(parts.join('\n') || `Erro HTTP ${res.status}`);
}
```

- [ ] **Step 4: Rodar os testes de mensagem amigavel**

Run: `npm run test:run -- src/test/appwriteErrors.test.js`  
Expected: PASS com a nova traducao do erro e sem regressao nas mensagens existentes.

- [ ] **Step 5: Verificar manualmente o fluxo de UI**

Run: `npm run test:run -- src/test/appwriteErrors.test.js`  
Expected: PASS; depois validar manualmente que:
- a aba Integracoes nao menciona conta padrao da plataforma
- sync/cancel no drawer mostram mensagem amigavel em vez de erro cru
- envio de contrato mostra orientacao para `Integracoes > Autentique`

- [ ] **Step 6: Commit**

```bash
git add src/components/academy/ContractsAutentiqueSection.jsx src/components/contracts/ContractDetailsDrawer.tsx src/features/contracts/api.ts src/test/appwriteErrors.test.js
git commit -m "feat: clarify academy autentique requirement in ui"
```

### Task 4: Atualizar documentacao e validar a entrega

**Files:**
- Modify: `c:\Users\Usuario\Desktop\JIU JITSU\docs\contracts-autentique.md`
- Reference: `c:\Users\Usuario\Desktop\JIU JITSU\docs\superpowers\specs\2026-06-21-remover-fallback-autentique-design.md`

- [ ] **Step 1: Atualizar a regra de credencial na documentacao**

```md
## Credencial da academia

- O runtime de contratos usa apenas o token salvo na configuracao da propria academia.
- `AUTENTIQUE_TOKEN` e `AUTENTIQUE_API_TOKEN` nao sao fallback para envio, sync ou cancelamento no fluxo multi-tenant.
- Sem token proprio, a academia pode editar modelos e gerar previa, mas nao envia contratos para assinatura.
```

- [ ] **Step 2: Remover/requalificar trechos de conta padrao**

```md
6. **Auto-assinatura da academia (opcional):** disponivel apenas quando a academia configurou o token e o e-mail da propria conta Autentique.
```

- [ ] **Step 3: Rodar a bateria focal de testes**

Run: `npm run test:run -- src/test/signContract.test.ts src/test/contractHttp.test.ts src/test/humanizeAutentiqueError.test.js src/test/appwriteErrors.test.js`  
Expected: PASS em todos os testes focados da entrega.

- [ ] **Step 4: Checar diagnosticos dos arquivos editados**

Run: usar `GetDiagnostics` para:
- `lib/autentique/autentiqueService.ts`
- `lib/contracts/contractHttp.ts`
- `lib/contracts/contractAutentiqueSync.ts`
- `src/components/academy/ContractsAutentiqueSection.jsx`
- `src/components/contracts/ContractDetailsDrawer.tsx`
- `src/features/contracts/api.ts`

Expected: sem erros novos relevantes.

- [ ] **Step 5: Commit**

```bash
git add docs/contracts-autentique.md
git commit -m "docs: document academy-only autentique contracts"
```
