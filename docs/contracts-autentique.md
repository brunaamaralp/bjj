# Contratos digitais (Autentique)

Referência oficial: [Webhooks – Autentique](https://docs.autentique.com.br/api/integration-basics/webhooks).

## Variáveis de ambiente (Vercel)

| Variável | Descrição |
|----------|-----------|
| `AUTENTIQUE_TOKEN` ou `AUTENTIQUE_API_TOKEN` | Bearer da API Autentique |
| `AUTENTIQUE_WEBHOOK_SECRET` | Segredo para validar HMAC do webhook (`x-autentique-signature`) |
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

### Coleção `webhook_logs` (handler)

Atributos usados por `saveWebhookLog`:

- `raw_payload`, `signature_valid`, `processed`, `event_type`, `error`

Atributos legados (`payload`, `is_valid`, `signature_header`, …) podem coexistir; o código atual usa apenas os campos acima.

### Coleção `contracts` (opcionais)

- `signers_links` (String, até 2048) — JSON `[{ name, email, public_id, short_link }]`
- `template_id` (String) — modelo usado na criação

## Modelos de contrato (editor HTML)

- **UI:** Empresa → aba **Contratos** (`/empresa?tab=contratos`; legado `/contratos/modelos` redireciona)
- **Novo modelo:** `/empresa?tab=contratos&new=1`
- **Editar:** `/empresa?tab=contratos&edit={id}`
- **API:** `GET/POST/PATCH/DELETE /api/contract-templates` (JSON com `body_html`)
- **Envio:** modelo + variáveis do aluno → PDF no servidor → `createDocument` na Autentique
- **Vínculo por plano:** prioridade em **Financeiro → Planos → Modelo de contrato**; fallback via checkboxes na aba Contratos

## Checklist de produção — webhook

1. **Painel Autentique** → Webhooks → URL do deploy, por exemplo:
   `https://www.navefit.com/api/webhooks/autentique`
2. **Vercel:** `AUTENTIQUE_WEBHOOK_SECRET` = mesmo valor exibido no painel Autentique
3. Habilitar eventos de **documento** e **assinatura** necessários (`document.finished`, `signature.accepted`, `signature.viewed`, etc.)
4. Teste: contrato em sandbox (owner) → assinar no link Autentique → status no Nave em poucos segundos
5. **Integrações** → aba Autentique: copiar URL do webhook para colar no painel

## Endpoint e segurança

- `POST /api/webhooks/autentique` → `api/webhooks.js?provider=autentique` (rewrite em `vercel.json`)
- Header: `x-autentique-signature` — HMAC SHA256 do **corpo bruto** com `AUTENTIQUE_WEBHOOK_SECRET`
- O handler lê o body sem parser JSON prévio (obrigatório para o HMAC bater)

### Payloads (formato Autentique)

- **Documento** (`document.*`): `event.data.object` é um objeto com `id` e `object: "document"`
- **Assinatura** (`signature.*`): `event.data.document` = ID do documento; `event.data.public_id` = signatário

O extrator em `autentiqueWebhookHandler.ts` suporta ambos os formatos.

### Boas práticas (Autentique)

- Eventos podem chegar **fora de ordem** ou **duplicados** — o Nave não deduplica por `event.id` ainda
- Responder **2xx** rapidamente; processamento pesado na mesma request pode estourar timeout em pico
- Sem webhook configurado, o botão **Atualizar** em Alunos → Contratos só recarrega dados do Appwrite (não consulta a API Autentique)

## APIs autenticadas

`GET` e `POST /api/contracts` exigem:

- `Authorization: Bearer <JWT>`
- `x-academy-id: <id da academia>`

O `academyId` gravado no contrato **sempre** vem do header validado no servidor, nunca do FormData.

## Variáveis do modelo

No editor, use `{{nome_variavel}}` (ex.: `{{nome_aluno}}`, `{{plano}}`, `{{cpf_responsavel}}`).

O **CPF do responsável** vem do cadastro do aluno; crie o atributo `cpf_responsavel` na coleção de leads/students no Appwrite se ainda não existir.

O PDF enviado à Autentique é **texto simplificado** (HTML convertido); formatação rica pode não aparecer no documento final.

## Fluxo de assinatura

1. No Nave: modelo, signatário(s), entrega (e-mail ou WhatsApp).
2. Autentique envia o link (ou **Copiar link** no drawer do contrato).
3. Assinatura **sempre** na interface da Autentique (não há “aceitar” dentro do Nave).
4. Webhook atualiza status e signatários no Appwrite; timeline no drawer.

## Limitações conhecidas

- **Cancelar** no Nave só marca `cancelled` localmente — não cancela o documento na Autentique
- **Atualizar** na listagem não sincroniza status com a API Autentique
- Cancelamento/remoção na Autentique pode gerar `document.deleted` (mapeado no lead como expirado/cancelado conforme regras atuais)
