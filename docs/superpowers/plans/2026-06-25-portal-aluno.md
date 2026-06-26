# Portal do aluno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar portal web em `/portal/*` para alunos e responsáveis (login Appwrite), com convite pela academia, dados de perfil/financeiro/presença/contratos em leitura, e guias de orientação editáveis pelo owner/admin.

**Architecture:** Contas Appwrite + coleções `student_portal_access` / `portal_invites` / `academy_portal_guides`. Handlers em `lib/server/portal*.js`, roteados por `api/leads.js?route=portal-*`. Shell React isolado (sem CRM). Reuso de lógica de `studentsHandler` (perfil, presença) e contratos Autentique, sempre atrás de `assertPortalAccess`.

**Tech Stack:** Appwrite (Auth + DB), Vercel Functions (`api/leads.js`), React + React Router, `react-markdown` + `rehype-sanitize`, Vitest.

**Specs:** [PRODUCT](../specs/2026-06-25-portal-aluno-PRODUCT.md) · [TECH](../specs/2026-06-25-portal-aluno-TECH.md)

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/provision-portal-schema.mjs` | **Create** | Coleções + `email_responsavel` em students |
| `lib/server/portalAccess.js` | **Create** | `assertPortalAccess`, `listPortalStudentsForUser`, `resolveInviteEmail` |
| `lib/server/portalInviteCore.js` | **Create** | Token, hash, temp password, Appwrite user create |
| `lib/server/portalInviteHandler.js` | **Create** | POST/DELETE convite (staff) |
| `lib/server/portalActivateHandler.js` | **Create** | POST ativação pública |
| `lib/server/portalContextHandler.js` | **Create** | GET contexto portal |
| `lib/server/portalProfileHandler.js` | **Create** | GET perfil escopado |
| `lib/server/portalFinanceHandler.js` | **Create** | GET financeiro leitura |
| `lib/server/portalAttendanceHandler.js` | **Create** | GET presença |
| `lib/server/portalContractsHandler.js` | **Create** | GET contratos pendentes |
| `lib/server/portalGuidesHandler.js` | **Create** | GET guias (portal) |
| `lib/server/portalGuidesManageHandler.js` | **Create** | CRUD guias (staff) |
| `lib/server/portalSiblingLink.js` | **Create** | Auto-match responsável irmãos |
| `lib/server/portalRouter.js` | **Create** | Dispatch `route=portal-*` |
| `api/leads.js` | Modify | `if (route.startsWith('portal'))` → portalRouter |
| `src/lib/portalApi.js` | **Create** | Client fetch portal |
| `src/lib/portalSession.js` | **Create** | Helpers bootstrap / storage active student |
| `src/pages/portal/*` | **Create** | Shell + páginas |
| `src/components/portal/*` | **Create** | Nav, switcher, markdown view |
| `src/components/academy/PortalGuidesSection.jsx` | **Create** | CRUD staff |
| `src/App.jsx` | Modify | Shell `/portal`, bootstrap split |
| `src/lib/mapAppwriteStudentDoc.js` | Modify | `email_responsavel` |
| `src/lib/leadStudentPayload.js` | Modify | persist `email_responsavel` |
| `src/pages/StudentProfile.jsx` | Modify | Convite + badge portal |
| `src/pages/AcademySettings.jsx` | Modify | Tab Portal → Guias |
| `src/styles/portal.css` | **Create** | Layout portal |
| `package.json` | Modify | `provision:portal`, deps markdown |
| `.env.example` | Modify | 3 collection IDs |
| `docs/data-model.md` | Modify | Novas coleções |
| `docs/appwrite-setup.md` | Modify | Provision portal |
| `docs/flows/portal/aluno-portal.md` | **Create** | Fluxo aluno |
| `docs/flows/portal/guias-orientacao.md` | **Create** | Fluxo staff guias |

---

## Phase F1 — Schema + convite + shell login

### Task 1: Provision schema

**Files:**
- Create: `scripts/provision-portal-schema.mjs`
- Modify: `package.json`, `.env.example`, `docs/appwrite-setup.md`

- [ ] **Step 1: Script de provisionamento**

```javascript
// scripts/provision-portal-schema.mjs — padrão provision-finance-features-schema.mjs
// 1) ensureAttribute students.email_responsavel (string 320)
// 2) createCollection student_portal_access + attributes (ver TECH.md §3.2)
// 3) createCollection portal_invites
// 4) createCollection academy_portal_guides
// console.log env vars APPWRITE_STUDENT_PORTAL_ACCESS_COL_ID= ...
```

- [ ] **Step 2: Adicionar script npm**

```json
"provision:portal": "node --env-file=.env scripts/provision-portal-schema.mjs"
```

- [ ] **Step 3: Rodar local** (com `.env`):

```bash
npm run provision:portal
```

Expected: 3 collection IDs impressos; `email_responsavel` em students.

- [ ] **Step 4: Commit**

```bash
git add scripts/provision-portal-schema.mjs package.json .env.example docs/appwrite-setup.md
git commit -m "chore: provision schema portal do aluno"
```

---

### Task 2: `portalAccess` + testes

**Files:**
- Create: `lib/server/portalAccess.js`
- Create: `lib/server/appwritePortalCollections.js`
- Create: `lib/server/portalAccess.test.js`

- [ ] **Step 1: Teste falhando**

```javascript
// lib/server/portalAccess.test.js
import { describe, it, expect, vi } from 'vitest';
import { resolveInviteEmail } from './portalAccess.js';

describe('resolveInviteEmail', () => {
  it('usa email do aluno adulto', () => {
    expect(resolveInviteEmail({ type: 'Adulto', email: 'a@x.com', email_responsavel: '' }))
      .toEqual({ email: 'a@x.com', relationship: 'self' });
  });
  it('usa email_responsavel para criança', () => {
    expect(resolveInviteEmail({ type: 'Criança', email: '', email_responsavel: 'pai@x.com' }))
      .toEqual({ email: 'pai@x.com', relationship: 'guardian' });
  });
  it('falha menor sem email responsável', () => {
    expect(() => resolveInviteEmail({ type: 'Criança', email_responsavel: '' }))
      .toThrow('guardian_email_required');
  });
});
```

- [ ] **Step 2: Implementar**

```javascript
// lib/server/portalAccess.js
export function resolveInviteEmail(student) {
  const type = String(student.type || 'Adulto');
  const minor = type === 'Criança' || type === 'Juniores';
  if (minor) {
    const email = String(student.email_responsavel || '').trim().toLowerCase();
    if (!email) throw Object.assign(new Error('guardian_email_required'), { code: 'guardian_email_required' });
    return { email, relationship: 'guardian' };
  }
  const email = String(student.email || '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('student_email_required'), { code: 'student_email_required' });
  return { email, relationship: 'self' };
}
```

- [ ] **Step 3: `npm test -- portalAccess.test.js`** → PASS

- [ ] **Step 4: Commit** `feat(portal): portal access helpers`

---

### Task 3: Convite (staff API)

**Files:**
- Create: `lib/server/portalInviteCore.js`
- Create: `lib/server/portalInviteHandler.js`
- Create: `lib/server/portalInvite.test.js`
- Modify: `lib/server/portalRouter.js` (stub)
- Modify: `api/leads.js`

- [ ] **Step 1: `portalInviteCore` — token + hash**

```javascript
import { createHash, randomBytes } from 'node:crypto';
export function generateInviteToken() {
  return randomBytes(32).toString('base64url');
}
export function hashInviteToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
export function buildActivationUrl(token) {
  const base = process.env.VITE_APP_URL || process.env.VERCEL_URL || '';
  return `${base.replace(/\/$/, '')}/portal/ativar/${encodeURIComponent(token)}`;
}
```

- [ ] **Step 2: Handler POST** — fluxo:
  1. `ensureAuth` + `ensureAcademyAccess`
  2. `assertStudentInAcademy`
  3. `resolveInviteEmail`
  4. Checar conflito staff (`ensureAcademyAccess` do e-mail convidado se já user)
  5. `Users.create` (Appwrite server) se e-mail novo — senha aleatória interna
  6. Upsert `student_portal_access` (`pending`)
  7. Insert `portal_invites` com `token_hash`, `expires_at` +7d
  8. Retornar `activation_url` ou `temp_password` (tipo `temp_password`)

- [ ] **Step 3: Testes unitários** mock databases/Users

- [ ] **Step 4: Wire em `api/leads.js`**

```javascript
import portalRouter from '../lib/server/portalRouter.js';
// ...
if (String(req.query.route || '').startsWith('portal')) {
  return portalRouter(req, res);
}
```

- [ ] **Step 5: `npm test -- portalInvite`** → PASS

- [ ] **Step 6: Commit** `feat(portal): staff invite API`

---

### Task 4: Ativação pública

**Files:**
- Create: `lib/server/portalActivateHandler.js`
- Modify: `lib/server/portalRouter.js`

- [ ] **Step 1: POST `portal-activate`** — valida hash, marca `used`, set `access.status=active`, `activated_at`
- [ ] **Step 2: Se `invite_type=link` e usuário sem senha definida → `{ next: 'set_password' }`
- [ ] **Step 3: Teste** token expirado → 410; token usado → 409
- [ ] **Step 4: Commit** `feat(portal): activation endpoint`

---

### Task 5: Shell `/portal` login + ativar

**Files:**
- Create: `src/pages/portal/PortalLogin.jsx`
- Create: `src/pages/portal/PortalActivate.jsx`
- Create: `src/pages/portal/PortalForgotPassword.jsx`
- Create: `src/styles/portal.css`
- Modify: `src/App.jsx`

- [ ] **Step 1: Bloco em `App.jsx` antes de `!user`**

```jsx
if (/^\/portal(\/|$)/.test(location.pathname)) {
  return (
    <>
      <OfflineBanner />
      <NaviToasts />
      <Suspense fallback={<RouteFallback />}>
        <PortalAppRoutes />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 2: `PortalLogin`** — reutiliza `authService.login`; após OK chama `GET portal-context`; se vínculo ativo → `/portal`; senão erro amigável
- [ ] **Step 3: `PortalActivate`** — lê `:token`, POST `portal-activate`, formulário senha se necessário
- [ ] **Step 4: Estilos** — tokens `--portal-*` alinhados a `DESIGN_SYSTEM.md`; mobile-first
- [ ] **Step 5: Commit** `feat(portal): login and activation pages`

---

## Phase F2 — Contexto + layout + convite UI staff

### Task 6: `portal-context` + layout autenticado

**Files:**
- Create: `lib/server/portalContextHandler.js`
- Create: `src/lib/portalApi.js`
- Create: `src/lib/portalSession.js`
- Create: `src/pages/portal/PortalLayout.jsx`
- Create: `src/components/portal/PortalStudentSwitcher.jsx`
- Create: `src/components/portal/PortalNav.jsx`
- Create: `src/pages/portal/PortalHome.jsx`

- [ ] **Step 1: GET `portal-context`** — lista `student_portal_access` ativos do `auth_user_id`, join `students` + `academies` (nome, logo, phone)
- [ ] **Step 2: `portalSession`** — `sessionStorage` key `portal_active_student_id`
- [ ] **Step 3: `PortalLayout`** — header academia, switcher, `<Outlet />`, bottom nav
- [ ] **Step 4: `PortalHome`** — cards resumo (turma, faixa, chip financeiro placeholder)
- [ ] **Step 5: Commit** `feat(portal): authenticated shell and home`

---

### Task 7: Convite no `StudentProfile`

**Files:**
- Modify: `src/pages/StudentProfile.jsx`
- Create: `src/components/student/StudentPortalInvitePanel.jsx`
- Modify: `src/lib/mapAppwriteStudentDoc.js`, `src/lib/leadStudentPayload.js`

- [ ] **Step 1: Campo `email_responsavel`** nos formulários de menor (perfil + matrícula)
- [ ] **Step 2: Painel convite** — dropdown link/senha temporária; `useToast` ao copiar URL; badge status via GET access
- [ ] **Step 3: Commit** `feat(portal): student profile invite UI`

---

### Task 8: Vínculo irmãos + revogação

**Files:**
- Create: `lib/server/portalSiblingLink.js`
- Modify: `lib/server/portalInviteHandler.js`
- Modify: `lib/server/studentsHandler.js` (deactivate side-effect)

- [ ] **Step 1: `findGuardianAccessMatch(academyId, email, cpf)`** — busca access ativo mesmo e-mail/cpf
- [ ] **Step 2: API opcional `portal-link-sibling` POST** ou integrar no save student quando banner confirmado
- [ ] **Step 3: `handleDeactivate`** — chamar `revokePortalAccessForStudent(studentId)`
- [ ] **Step 4: Testes + commit** `feat(portal): sibling link and revoke on deactivate`

---

## Phase F3 — Financeiro, presença, perfil

### Task 9: Endpoints de leitura

**Files:**
- Create: `lib/server/portalProfileHandler.js`
- Create: `lib/server/portalFinanceHandler.js`
- Create: `lib/server/portalAttendanceHandler.js`
- Modify: `lib/server/portalRouter.js`

- [ ] **Step 1: `portal-profile`** — extrair de `handleProfile` campos allowlist:

```javascript
const PORTAL_STUDENT_FIELDS = ['id','name','email','phone','type','turma','belt','plan','birthDate','responsavel','studentStatus'];
```

- [ ] **Step 2: `portal-finance`** — listar `student_payments` do aluno (últimos 24), computar status com lógica de `paymentStatus.js` (sem valores internos de taxa)
- [ ] **Step 3: `portal-attendance`** — reexport `fetchAttendanceStatsServer` + últimos 20 check-ins
- [ ] **Step 4: Testes integração mock DB**
- [ ] **Step 5: Commit** `feat(portal): read APIs for profile finance attendance`

---

### Task 10: Páginas portal

**Files:**
- Create: `src/pages/portal/PortalFinance.jsx`
- Create: `src/pages/portal/PortalAttendance.jsx`
- Create: `src/pages/portal/PortalProfile.jsx`
- Create: `src/components/portal/PortalWhatsAppCta.jsx`

- [ ] **Step 1: Financeiro** — lista + chip status; CTA WhatsApp (`wa.me` com phone academia)
- [ ] **Step 2: Presença** — stats + lista
- [ ] **Step 3: Perfil** — leitura only
- [ ] **Step 4: Commit** `feat(portal): finance attendance profile pages`

---

## Phase F3b — Orientações

### Task 11: CRUD guias (staff)

**Files:**
- Create: `lib/server/portalGuidesManageHandler.js`
- Create: `lib/server/portalGuidesCore.js` (slugify, validate body length)
- Create: `src/components/academy/PortalGuidesSection.jsx`
- Modify: `src/pages/AcademySettings.jsx`

- [ ] **Step 1: Handler** — GET list, POST create, PATCH update, DELETE; `assertRoleOwner` ou admin only
- [ ] **Step 2: UI staff** — lista ordenável (botões ↑↓), editor textarea Markdown, toggle publicado, upload anexo via endpoint Blob existente do projeto
- [ ] **Step 3: Tab** `?tab=portal` em AcademySettings (owner/admin)
- [ ] **Step 4: `npm test -- portalGuides`**
- [ ] **Step 5: Commit** `feat(portal): academy guides staff CRUD`

---

### Task 12: Guias no portal aluno

**Files:**
- Create: `lib/server/portalGuidesHandler.js`
- Create: `src/pages/portal/PortalGuides.jsx`
- Create: `src/pages/portal/PortalGuideDetail.jsx`
- Create: `src/components/portal/PortalMarkdown.jsx`
- Modify: `package.json` (deps)

- [ ] **Step 1: Instalar deps**

```bash
npm install react-markdown rehype-sanitize
```

- [ ] **Step 2: GET `portal-guides`** — published only, order `sort_order`; `?slug=` detalhe
- [ ] **Step 3: `PortalMarkdown`** — render sanitizado
- [ ] **Step 4: Rotas** `/portal/orientacoes`, `/portal/orientacoes/:slug`
- [ ] **Step 5: Cards no `PortalHome`** — até 2 guias em destaque
- [ ] **Step 6: Commit** `feat(portal): student guides pages`

---

## Phase F4 — Contratos + senha temporária + polish staff

### Task 13: Contratos pendentes

**Files:**
- Create: `lib/server/portalContractsHandler.js`
- Create: `src/pages/portal/PortalContracts.jsx`

- [ ] **Step 1: Listar contracts** `lead_id=student_id` onde `displayStatus` ≠ signed/cancelled
- [ ] **Step 2: Incluir URL assinatura Autentique** por signer (reuso `lib/contracts/*`)
- [ ] **Step 3: UI lista + abrir nova aba**
- [ ] **Step 4: Commit** `feat(portal): pending contracts`

---

### Task 14: Senha temporária + troca obrigatória

**Files:**
- Create: `src/pages/portal/PortalChangePassword.jsx`
- Modify: `lib/server/portalActivateHandler.js`, `PortalLogin.jsx`

- [ ] **Step 1: Flag `must_change_password` em access** ao convite temp_password
- [ ] **Step 2: Guard em `PortalLayout`** — redirect `/portal/trocar-senha`
- [ ] **Step 3: `account.updatePassword`** + limpar flag
- [ ] **Step 4: Commit** `feat(portal): forced password change`

---

## Phase F5 — Bootstrap staff/portal split + docs + testes

### Task 15: Bootstrap `App.jsx` definitivo

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Após login staff path** — se user **only** portal access (portal-context ok, academy bootstrap falha ou sem team) → `/portal`
- [ ] **Step 2: Impedir** usuário portal de ver rotas CRM (redirect)
- [ ] **Step 3: Teste** `src/test/portalBootstrap.test.js`
- [ ] **Step 4: Commit** `fix(portal): auth bootstrap routing`

---

### Task 16: Documentação fluxos

**Files:**
- Create: `docs/flows/portal/aluno-portal.md`
- Create: `docs/flows/portal/guias-orientacao.md`
- Modify: `docs/flows/README.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Fluxos com mapa de telas + checklist Seção A**
- [ ] **Step 2: Indexar no README**
- [ ] **Step 3: Commit** `docs: portal aluno user flows`

---

### Task 17: Verificação final

- [ ] **Step 1: `npm test`** — suite completa sem regressões
- [ ] **Step 2: Manual** — convite adulto → ativar → ver financeiro/presença/guias
- [ ] **Step 3: Manual** — responsável 2 filhos → switcher
- [ ] **Step 4: Critérios aceite PRODUCT §16** — checklist no PR

---

## Spec coverage (self-review)

| Requisito PRODUCT | Task |
|-------------------|------|
| Convite academia | 3, 7 |
| MVP financeiro leitura | 9, 10 |
| Presença | 9, 10 |
| Contratos | 13 |
| Orientações guias | 11, 12 |
| Híbrido adulto/responsável | 2, 3 |
| Vários filhos switcher | 6, 8 |
| Link + senha temp | 3, 4, 14 |
| Vínculo irmãos híbrido | 8 |
| `/portal` URL | 5, 6 |
| `email_responsavel` | 1, 7 |
| Sem novo `/api/` file | 3 |
| Revogação desativar | 8 |
| Staff guias owner/admin | 11 |
| Markdown sanitizado | 12 |

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-25-portal-aluno.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
