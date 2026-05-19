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

## Modelos de contrato (editor HTML)

- **UI:** `/contratos/modelos` (somente owner) — CRUD com editor HTML e variáveis (`{{nome_aluno}}`, `{{plano}}`, etc.)
- **API:** `GET/POST/PATCH/DELETE /api/contract-templates` (JSON com `body_html`)
- **Criação de contrato:** apenas seleção de modelo; o servidor mescla variáveis do aluno e gera o PDF para a Autentique
- **Vínculo com planos:** Financeiro → Configurações → Planos → **Modelo de contrato**

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

O `academyId` gravado no contrato **sempre** vem do header validado no servidor, nunca do FormData.

## Fallback sem webhook

Enquanto o webhook não estiver configurado, use o botão **Atualizar** na página `/contratos` ou volte a focar a aba do navegador (refetch automático do React Query).
