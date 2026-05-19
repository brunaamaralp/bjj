# Contratos digitais (Autentique)

## Variáveis de ambiente (Vercel)

| Variável | Descrição |
|----------|-----------|
| `AUTENTIQUE_TOKEN` ou `AUTENTIQUE_API_TOKEN` | Bearer da API Autentique |
| `AUTENTIQUE_WEBHOOK_SECRET` | Segredo para validar HMAC do webhook |
| `APPWRITE_CONTRACTS_COLLECTION_ID` | Coleção `contracts` |
| `APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID` | Coleção `contract_signers` |
| `APPWRITE_CONTRACT_EVENTS_COLLECTION_ID` | Coleção `contract_events` |
| `APPWRITE_WEBHOOK_LOGS_COLLECTION_ID` | Coleção `webhook_logs` |
| `APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID` | Coleção `contract_templates` (PDFs reutilizáveis) |
| `APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID` | Bucket Appwrite Storage para os PDFs dos modelos |

Provisionamento automático:

```bash
npm run provision:contract-templates
```

Na coleção **contracts**, atributos opcionais:

- `signers_links` (String, até 2048) — JSON com `[{ name, email, public_id, short_link }]` para copiar links de assinatura no drawer
- `template_id` (String) — referência ao modelo usado na criação (se houver)

## Modelos de contrato (Fase 1)

- **UI:** `/contratos/modelos` (somente owner) — upload de PDF estático por academia
- **API:** `GET/POST/PATCH/DELETE /api/contract-templates` (mesma function `api/contracts.js`, rota `?route=templates`)
- **Criação de contrato:** no modal, escolher modelo **ou** enviar PDF; o servidor baixa o PDF do Storage quando `template_id` é enviado
- **Vínculo com planos:** em Financeiro → Configurações → Planos, campo **Modelo de contrato** (salvo em `financeConfig.plans[].contractTemplateId`); nomes de plano também podem ser listados no modelo (`plan_names`)

## Checklist de produção — webhook

1. **Painel Autentique** → Webhooks → URL:
   `https://www.navefit.com/api/webhooks/autentique`
   (em preview/staging use o domínio do deploy correspondente)
2. **Vercel** → Environment Variables → `AUTENTIQUE_WEBHOOK_SECRET` = valor exibido no painel Autentique
3. Confirmar que eventos de documento e assinatura estão habilitados no webhook
4. Após deploy, enviar um contrato de teste (sandbox, só owner) e assinar; o status no Nave deve atualizar em segundos sem recarregar a página (use **Atualizar** na listagem se o webhook ainda não estiver ativo)

## Endpoint

- `POST /api/webhooks/autentique` → handler em `api/webhooks.js?provider=autentique`
- Header validado: `x-autentique-signature` (HMAC SHA256 do body com `AUTENTIQUE_WEBHOOK_SECRET`)

## APIs autenticadas

`GET` e `POST /api/contracts` exigem:

- `Authorization: Bearer <JWT>`
- `x-academy-id: <id da academia>`

O `academy_id` gravado no contrato **sempre** vem do header validado no servidor, nunca do FormData.

## Fallback sem webhook

Enquanto o webhook não estiver configurado, use o botão **Atualizar** na página `/contratos` ou volte a focar a aba do navegador (refetch automático do React Query).
