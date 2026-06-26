# Portal do aluno — TECH Spec

**Data:** 2026-06-25  
**PRODUCT:** [2026-06-25-portal-aluno-PRODUCT.md](./2026-06-25-portal-aluno-PRODUCT.md)  
**Plano de implementação:** [../plans/2026-06-25-portal-aluno.md](../plans/2026-06-25-portal-aluno.md)

---

## 1. Resumo técnico

| Item | Decisão |
|------|---------|
| Auth | Appwrite `Account` (e-mail/senha) + coleção `student_portal_access` |
| API hub | `api/leads.js?route=portal-*` (sem novo arquivo em `/api/`) |
| Shell UI | Rotas `/portal/*` isoladas em `App.jsx` (padrão `/inscricao`) |
| Conteúdo orientações | Coleção `academy_portal_guides`; Markdown sanitizado no client |
| Tenant | `academy_id` em todas as queries; `assertPortalAccess` em rotas com JWT portal |

---

## 2. Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `VITE_APPWRITE_STUDENTS_COLLECTION_ID` | Já existe |
| `APPWRITE_STUDENT_PORTAL_ACCESS_COL_ID` | Nova — vínculos auth ↔ aluno |
| `APPWRITE_PORTAL_INVITES_COL_ID` | Nova — tokens de ativação |
| `APPWRITE_ACADEMY_PORTAL_GUIDES_COL_ID` | Nova — guias de orientação |
| `APPWRITE_API_KEY` | Criar usuário Appwrite no convite (server) |

Adicionar em `.env.example` e `docs/appwrite-setup.md`.

---

## 3. Schema Appwrite

### 3.1 `students` — patch

| Atributo | Tipo | Tamanho |
|----------|------|---------|
| `email_responsavel` | string | 320 |

### 3.2 `student_portal_access`

| Atributo | Tipo | Índice |
|----------|------|--------|
| `academy_id` | string | yes |
| `student_id` | string | yes |
| `auth_user_id` | string | yes |
| `relationship` | string | — (`self` \| `guardian`) |
| `status` | string | — (`pending` \| `active` \| `revoked`) |
| `invited_at` | datetime | — |
| `activated_at` | datetime | — |
| `revoked_at` | datetime | — |
| `revoked_reason` | string | 128 |
| `must_change_password` | boolean | — |

### 3.3 `portal_invites`

| Atributo | Tipo |
|----------|------|
| `academy_id` | string |
| `student_id` | string |
| `email` | string |
| `invite_type` | string (`link` \| `temp_password`) |
| `token_hash` | string |
| `expires_at` | datetime |
| `used_at` | datetime |
| `created_by_user_id` | string |
| `status` | string |

### 3.4 `academy_portal_guides`

| Atributo | Tipo |
|----------|------|
| `academy_id` | string |
| `title` | string (256) |
| `slug` | string (128) |
| `summary` | string (160) |
| `body_markdown` | string (24576) |
| `category` | string (`geral` \| `regras` \| `primeira_aula` \| `faq`) |
| `sort_order` | integer |
| `published` | boolean |
| `attachments_json` | string (8192) |
| `created_by_user_id` | string |

Índice composto lógico: listar por `(academy_id, published)` ordenado por `sort_order`.

---

## 4. API — contratos

Base: `GET|POST|PATCH|DELETE /api/leads?route=<name>`

Todas as rotas portal autenticadas exigem `Authorization: Bearer <jwt>`.

### 4.1 Staff

**`portal-invite` POST**

```json
{
  "student_id": "abc",
  "invite_type": "link",
  "force_new": false
}
```

Resposta 200:

```json
{
  "sucesso": true,
  "activation_url": "https://app/portal/ativar/TOKEN",
  "temp_password": null,
  "access_status": "pending"
}
```

**`portal-invite` DELETE** — body `{ "student_id" }` → revoga access + cancela invites pendentes.

**`portal-guides-manage`** — CRUD owner/admin; filtro `academy_id` via `ensureAcademyAccess`.

### 4.2 Público

**`portal-activate` POST** `{ "token", "password?" }` → `{ "sucesso", "next": "login" | "set_password" }`

### 4.3 Portal (JWT + vínculo)

| route | Query | Resposta principal |
|-------|-------|-------------------|
| `portal-context` | — | `{ students[], academy, active_student_id }` |
| `portal-profile` | `student_id` | `{ student }` (campos públicos) |
| `portal-finance` | `student_id` | `{ paymentStatus, payments[] }` |
| `portal-attendance` | `student_id` | `{ stats, recent[] }` |
| `portal-contracts` | `student_id` | `{ contracts[] }` |
| `portal-guides` | `slug?` | lista ou detalhe |

---

## 5. Segurança

```javascript
// lib/server/portalAccess.js
export async function assertPortalAccess(databases, authUserId, academyId, studentId) {
  const list = await databases.listDocuments(DB_ID, ACCESS_COL, [
    Query.equal('auth_user_id', authUserId),
    Query.equal('academy_id', academyId),
    Query.equal('student_id', studentId),
    Query.equal('status', 'active'),
    Query.limit(1),
  ]);
  if (!list.documents?.[0]) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return list.documents[0];
}
```

- Rotas `portal-guides`: exigem vínculo ativo **qualquer** do usuário na academia (usa primeiro `student_id` ativo ou query `student_id` só para resolver `academy_id`).
- Staff e-mail conflito: antes do convite, se `auth_user_id` resolve para membership staff na mesma `academy_id` → `409 staff_email_conflict`.
- Markdown: `react-markdown` + `rehype-sanitize`; sem `dangerouslySetInnerHTML`.

---

## 6. Bootstrap `App.jsx`

Ordem de decisão pós-`getCurrentUser()`:

1. Path `/portal/*` → shell portal (login público ou layout autenticado).
2. Path `/inscricao/*` → já existente.
3. Usuário com **somente** vínculos portal (sem staff) → redirect `/portal`.
4. Usuário staff → fluxo atual.

Helper sugerido: `lib/server/portalMembership.js` + espelho client `src/lib/portalSession.js` (`GET portal-context` na init).

---

## 7. File map

Ver plano completo: [../plans/2026-06-25-portal-aluno.md](../plans/2026-06-25-portal-aluno.md).

---

## 8. Testes mínimos

| Arquivo | Cobre |
|---------|--------|
| `lib/server/portalAccess.test.js` | assertPortalAccess, resolve invite email |
| `lib/server/portalInvite.test.js` | token hash, temp password, sibling link |
| `lib/server/portalGuides.test.js` | slug único, published filter |
| `src/test/portalSession.test.js` | bootstrap redirect helpers |

Comando: `npm test -- portal`
