# Contratos digitais (Autentique)

Referência oficial: [Webhooks – Autentique](https://docs.autentique.com.br/api/integration-basics/webhooks).

## Variáveis de ambiente (Vercel)

| Variável | Descrição |
|----------|-----------|
| `AUTENTIQUE_TOKEN` ou `AUTENTIQUE_API_TOKEN` | Bearer da API Autentique |
| `AUTENTIQUE_WEBHOOK_SECRET` | Segredo para validar HMAC do webhook (`x-autentique-signature`) |
| `CHROMIUM_LOCAL` | `1` para forçar PDF via Chromium em dev local (opcional; em produção `VERCEL=1` já ativa) |
| `APPWRITE_CONTRACTS_COLLECTION_ID` | Coleção `contracts` |
| `APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID` | Coleção `contract_signers` |
| `APPWRITE_CONTRACT_EVENTS_COLLECTION_ID` | Coleção `contract_events` |
| `APPWRITE_WEBHOOK_LOGS_COLLECTION_ID` | Coleção `webhook_logs` |
| `APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID` | Coleção `contract_templates` |
| `APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID` | Bucket opcional (upload legado de PDF de modelo) |

### Provisionamento Appwrite

```bash
npm run provision:contract-templates
npm run provision:webhook-logs
```

Verificação local (read-only):

```bash
node --env-file=.env scripts/verify-contracts-autentique.mjs
```

Schema amplo (integrações, inclui contratos + webhook_logs):

```bash
node --env-file=.env scripts/verify-and-fix-schema-integrations.mjs
```

### Coleção `contract_templates`

- `body_html` — conteúdo HTML do modelo
- `signer_layout_json` — posições dos campos de assinatura (Autentique `positions`)
- `storage_file_id` / `file_url` — upload legado de PDF (opcional)

### Coleção `contracts` (opcionais)

- `signers_links` (String, até 2048) — JSON `[{ name, email, public_id, short_link }]`
- `template_id` (String) — modelo usado na criação

## Modelos de contrato (editor HTML)

- **UI:** Empresa → aba **Contratos** (`/empresa?tab=contratos`)
- **Novo modelo:** `/empresa?tab=contratos&new=1`
- **Editar:** `/empresa?tab=contratos&edit={id}`
- **API:** `GET/POST/PATCH/DELETE /api/contract-templates` (JSON com `body_html` e `signer_layout_json`)
- **Envio:** modelo + variáveis → PDF (Chromium) → `createDocument` com `positions` → Autentique
- **Vínculo por plano:** Financeiro → Planos → Modelo de contrato; fallback via checkboxes na aba Contratos

## PDF e campos de assinatura

1. O HTML do editor é renderizado em PDF A4 com **Chromium** (`@sparticuz/chromium` na Vercel).
2. No modelo, configure **Campos de assinatura** (slots Contratante / Contratada) com coordenadas `x`, `y` em % na **última página** (`z: last`).
3. No envio, cada signatário recebe `positions` na API Autentique (`SIGNATURE`, `NAME`, `DATE`, etc.).
4. Modelos padrão exigem **2 signatários** (aluno/responsável + contratada), na ordem dos slots.

**Não use `{{assinatura}}` no HTML** — assinatura digital é campo da Autentique, não variável de merge.

## Checklist de produção — webhook

1. **Painel Autentique** → Webhooks → `https://www.navefit.com/api/webhooks/autentique`
2. **Vercel:** `AUTENTIQUE_WEBHOOK_SECRET` igual ao painel
3. Eventos de documento e assinatura habilitados
4. Teste sandbox: enviar → assinar → status atualizado via webhook
5. **Integrações** → Autentique: URL do webhook

## Endpoint e segurança

- `POST /api/webhooks/autentique` → `api/webhooks.js?provider=autentique`
- Header: `x-autentique-signature` — HMAC SHA256 do corpo bruto
- Webhooks **duplicados** (`event.id` já processado) retornam 200 sem reprocessar

## APIs autenticadas

`GET` e `POST /api/contracts` exigem `Authorization` + `x-academy-id`.

- **Prévia PDF:** `POST /api/contracts?action=preview`
- **Sync manual:** `GET /api/contracts?id={id}&sync=1` — consulta Autentique e atualiza status/signatários
- **Cancelar:** `PATCH /api/contracts?id={id}` com `{ "action": "cancel" }` — remove na Autentique quando possível

## Variáveis do modelo

Use `{{nome_variavel}}` no HTML (ex.: `{{nome_aluno}}`, `{{plano}}`). Valores vêm do cadastro no envio.

## Fluxo de assinatura

1. Nave: modelo, signatários (quantidade = slots ativos), **como enviar o link** (e-mail ou WhatsApp por signatário).
2. **Autentique** envia o link no canal escolhido (não é o WhatsApp da academia — é mensagem da Autentique).
3. Assinatura na interface Autentique (campos nas posições configuradas).
4. Webhook ou botão **Sincronizar Autentique** no drawer atualiza o Nave.

## Teste em sandbox

1. Owner marca **Modo sandbox** no envio.
2. Assina pelo link da Autentique.
3. Compare PDF assinado no painel Autentique com a prévia do Nave.
4. Ajuste `x`/`y` dos slots se o campo não coincidir com o rodapé do contrato.

## Limitações

- Upload de PDF pronto (Canva) sem UI — apenas API legada (`storage_file_id`)
- Verificações avançadas Autentique (SMS, biometria) não configuradas
- Assinatura embarcada no Nave não é suportada (link Autentique obrigatório)
