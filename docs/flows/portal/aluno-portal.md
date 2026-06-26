# Portal do aluno — login, convite e jornada MVP

| Campo | Valor |
|---|---|
| **id** | `portal.aluno.jornada-mvp` |
| **módulo** | Portal |
| **personas** | aluno adulto, responsável (guardian), owner, recepcionista |
| **rotas** | `/portal/login`, `/portal/ativar/:token`, `/portal/trocar-senha`, `/portal`, `/portal/financeiro`, `/portal/presenca`, `/portal/orientacoes`, `/portal/contratos`, `/portal/perfil`, `/portal/mais` |
| **pré-requisitos** | Schema portal provisionado (`npm run provision:portal`); convite staff em `/student/:id`; usuário Appwrite criado ou ativado |
| **status** | revisado (código) |
| **última revisão** | 2026-06-25 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:**

- [docs/superpowers/specs/2026-06-25-portal-aluno-PRODUCT.md](../../superpowers/specs/2026-06-25-portal-aluno-PRODUCT.md)
- [docs/superpowers/specs/2026-06-25-portal-aluno-TECH.md](../../superpowers/specs/2026-06-25-portal-aluno-TECH.md)

**Harness relacionado:** `npm test -- portal --pool=threads --maxWorkers=2`

**Arquivos-chave:** `src/pages/portal/*`, `src/lib/portalApi.js`, `src/lib/portalBootstrap.js`, `lib/server/portalRouter.js`, `src/components/student/StudentPortalInvitePanel.jsx`

---

## Resumo

O aluno ou responsável acessa o **portal web** em `/portal` com login Appwrite. A academia convida pelo perfil do aluno; o convite pode ser **link de ativação** ou **senha temporária**. Após autenticação, o usuário vê início, financeiro (somente leitura), presença, orientações, contratos pendentes e perfil. Responsáveis com vários filhos alternam o aluno ativo no topo. Usuários **somente portal** não carregam o CRM nem criam academia automaticamente.

---

## Diagrama de fluxo

```mermaid
flowchart TD
  staff[Staff em /student/:id] --> invite[Convidar portal]
  invite --> link{Tipo convite}
  link -->|link| activate[/portal/ativar/:token]
  link -->|temp_password| login[/portal/login]
  activate --> login
  login --> mustPw{must_change_password?}
  mustPw -->|sim| changePw[/portal/trocar-senha]
  mustPw -->|não| home[/portal]
  changePw --> home
  home --> finance[/portal/financeiro]
  home --> attendance[/portal/presenca]
  home --> guides[/portal/orientacoes]
  home --> contracts[/portal/contratos]
  home --> switcher[Seletor de aluno]
  switcher --> home
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | `/student/:id` | `StudentPortalInvitePanel` | Convidar (link ou senha temp) | API `portal-invite`; badge status |
| 2 | `/portal/ativar/:token` | `PortalActivate` | Abrir link do convite | Token validado; redirect login |
| 3 | `/portal/login` | `PortalLogin` | E-mail + senha | `portal-context` ok → `/portal` ou `/portal/trocar-senha` |
| 4 | `/portal/trocar-senha` | `PortalChangePassword` | Nova senha | `updatePassword` + limpa flag access |
| 5 | `/portal` | `PortalHome` | Ver resumo | Nome, turma, faixa, chip financeiro, guias em destaque |
| 6 | `/portal` | `PortalStudentSwitcher` | Trocar filho | Contexto recarrega para `student_id` |
| 7 | `/portal/financeiro` | `PortalFinance` | Ver mensalidades | Somente leitura; CTA WhatsApp |
| 8 | `/portal/presenca` | `PortalAttendance` | Ver frequência | Histórico/resumo de check-ins |
| 9 | `/portal/orientacoes` | `PortalGuides` | Lista guias publicados | Markdown sanitizado no detalhe |
| 10 | `/portal/contratos` | `PortalContracts` | Assinar pendente | Abre Autentique em nova aba |
| 11 | `/portal/perfil` | `PortalProfile` | Ver dados cadastrais | Leitura; sem edição no MVP |
| 12 | `/portal/mais` | `PortalMore` | Perfil, contratos, sair | Links auxiliares + logout |

Navegação inferior: **Início · Financeiro · Presença · Orientações · Mais** (`PortalNav`).

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] `npm run provision:portal` executado; env vars das 3 coleções portal em Vercel e `.env.local`
- [ ] Aluno adulto com `email` ou menor com `email_responsavel` preenchido
- [ ] Para contratos no portal: módulo financeiro + contrato Autentique com `lead_id` = `$id` do aluno
- [ ] Para orientações: guia `published=true` em `academy_portal_guides`

### Checklist passo a passo — staff

1. [ ] Abrir `/student/:id` → painel **Portal do aluno** visível
2. [ ] Convidar adulto por link → `activation_url` copiável; status **pendente**
3. [ ] Convidar menor sem `email_responsavel` → erro `guardian_email_required`
4. [ ] Senha temporária → resposta com `temp_password` (uma vez); status **ativo**
5. [ ] 2º filho com mesmo responsável → banner vincular irmão; confirmar sem 2º convite
6. [ ] Desativar aluno → `student_portal_access` revogado (`studentsHandler`)
7. [ ] E-mail de convite igual a staff da academia → `staff_email_conflict` (409)

### Checklist passo a passo — aluno/responsável

1. [ ] `/portal/ativar/:token` válido → sucesso; token usado não reutiliza
2. [ ] `/portal/login` credenciais corretas → dashboard ou troca de senha obrigatória
3. [ ] Credenciais erradas → mensagem amigável; sem vazamento de detalhe
4. [ ] Conta sem vínculo portal → erro e logout
5. [ ] `/portal/trocar-senha` obrigatório quando `must_change_password=true`
6. [ ] Após troca, acesso normal ao `/portal`
7. [ ] Responsável com 2 filhos: seletor altera financeiro e presença
8. [ ] `/portal/financeiro` sem botões de edição; WhatsApp abre `wa.me` da academia
9. [ ] `/portal/contratos` lista pendentes; link Autentique abre nova aba
10. [ ] Usuário portal-only em `/` ou `/login` staff → redirect `/portal` (sem sidebar CRM)
11. [ ] Usuário portal-only não dispara criação automática de academia (`portalBootstrap`)

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Token inválido/expirado | Mensagem na ativação | `portalActivateHandler` |
| Sem acesso portal | 403 `no_portal_access` | `portalContextHandler` |
| Aluno revogado | 403 no contexto/APIs | `assertPortalAccess` |
| Falha de rede | `ErrorBanner` + retry | [docs/ux-feedback.md](../../ux-feedback.md) |

### Permissões e multi-tenant

- APIs aluno usam `resolvePortalStudentAccess` — JWT Appwrite + linha ativa em `student_portal_access` (`academy_id`, `student_id`, `auth_user_id`).
- Staff usa `ensureAcademyAccess` + header `x-academy-id` nas rotas `portal-invite`, `portal-guides-manage`.
- Hub único: `/api/leads?route=portal-*` (sem novo arquivo em `/api/`).

### Critérios de fluxo saudável vs regressão

**Saudável:** convite → ativação/login → dashboard com dados do aluno correto; switcher funciona; portal-only isolado do CRM.

**Regressão:** portal-only cria academia no bootstrap; APIs staff acessíveis sem team; financeiro editável no portal; guia rascunho visível ao aluno.

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 6 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Aluno adulto | Carlos Silva, carlos.demo@email.com |
| Responsável | Maria Santos, maria.demo@email.com |
| Filhos | João (8 anos), Pedro (10 anos) — mesmo `email_responsavel` |
| Academia | Academia Demo Nave — WhatsApp configurado |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | `/student/:id` | "Um clique e o aluno recebe o link do portal." | Convite sem app nativo |
| 2 | `/portal/ativar/:token` | "Ele define a senha e já entra." | Onboarding simples |
| 3 | `/portal` | "Tudo que importa: plano, situação e turma." | Autoatendimento |
| 4 | `/portal/financeiro` | "Mensalidades em dia, sem ligar na academia." | Transparência |
| 5 | Seletor de aluno | "Um login para todos os filhos." | Família |
| 6 | `/portal/contratos` | "Assina o contrato direto no celular." | Autentique |

### O que não mostrar

- `temp_password` real em gravação
- Tokens de ativação completos
- IDs Appwrite ou JWT no console

---

## Variações e atalhos

- **Desktop vs mobile:** layout max-width ~720px; bottom nav fixa no mobile.
- **Staff com portal:** se usuário tem academia staff + portal, CRM permanece acessível; portal via `/portal` manualmente.
- **Aliases CRM:** portal não usa `/students` nem `/alunos` — rotas próprias em `/portal/*`.

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-25 | — | Criação inicial (MVP B + contratos + troca senha + bootstrap) |
