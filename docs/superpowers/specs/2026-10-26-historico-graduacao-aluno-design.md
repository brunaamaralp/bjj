# Histórico de graduação do aluno + filtro por tempo na faixa

**Data:** 2026-10-26  
**Status:** aprovado em brainstorm — aguardando revisão do arquivo antes do plano  
**Origem:** pedido de controle de data de graduação (histórico + filtro operacional; alerta adiado).

**Specs / fluxos relacionados:**

- [2026-06-19-graduacao-aluno-opt-in-PRODUCT.md](./2026-06-19-graduacao-aluno-opt-in-PRODUCT.md) — campo `belt` + opt-in `beltGrades` (histórico era non-goal; esta spec cobre)
- [2026-06-19-graduacao-aluno-opt-in-TECH.md](./2026-06-19-graduacao-aluno-opt-in-TECH.md)
- [docs/flows/crm/aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)
- [docs/appwrite-setup.md](../../appwrite-setup.md) — atributos `students`

**Arquivos-chave (hoje):**

- `src/lib/beltGradesConfig.js` — opt-in, opções, `normalizeBeltValue`
- `src/pages/StudentProfile.jsx` — campo graduação no perfil
- `src/pages/Students.jsx` + hooks de filtro da lista
- `src/lib/mapAppwriteStudentDoc.js`, `src/lib/studentAppwritePatch.js`, store de alunos
- `lib/studentNlUpdates.js` / `lib/server/updateStudentServer.js` — patch NL de `belt`

---

## 1. Problema

A academia já registra a **faixa/evolução atual** (`belt`), mas não consegue:

1. Guardar **quando** o aluno chegou a cada nível (histórico de promoções).
2. **Filtrar** alunos por tempo na faixa atual (ex.: ≥ 6 meses) na lista de Alunos.

Sem isso, o controle de graduação fica fora do Nave (planilha / memória).

**Objetivo desta entrega:** histórico manual no perfil (fonte da verdade da faixa atual) + filtro por tempo na lista de Alunos. **Sem** alertas de elegibilidade.

---

## 2. Goals / Non-goals

### Goals

| # | Meta |
|---|------|
| G1 | Perfil com seção de histórico editável (add / edit / delete) |
| G2 | `belt` atual **sempre** = faixa da última entrada do histórico |
| G3 | Seed automático para aluno que já tem `belt` e histórico vazio |
| G4 | Filtro na lista **Alunos**: tempo na faixa atual (≥ 3 / 6 / 12 / 24 meses) |
| G5 | Mesmo opt-in de graduações (`beltGrades`); rótulos via `terms.belt` |
| G6 | Sem coleção nova e sem arquivo novo em `/api/` (Hobby 12/12) |

### Non-goals

| Item | Motivo |
|------|--------|
| Alerta / elegibilidade / notificação | Explicitamente adiado |
| Filtro em Retenção / Frequência | Fora do escopo desta v1 |
| Registro automático ao mudar faixa | Histórico é **só manual** |
| Matrícula pública / lead / cerimônia / certificado | Fora |
| Coleção `student_graduations` | Overkill; JSON no aluno basta |
| Histórico via NL/agente | Só UI; evita divergência |

---

## 3. Modelo de dados

### Atributos em `students` (Appwrite)

| Atributo | Tipo | Papel |
|----------|------|--------|
| `belt_history_json` | string (JSON) | Array de entradas `{ id, belt, date }` |
| `belt_since` | string | `YYYY-MM-DD` ou `""` — data da **última** promoção (filtro) |
| `belt` | string (já existe) | Faixa atual = última entrada |

**Entrada:**

- `id` — string estável (ex. `crypto.randomUUID()` ou id curto gerado no client)
- `belt` — valor da lista configurada (`beltGrades`), normalizado como hoje
- `date` — `YYYY-MM-DD` ou `""` se desconhecida

**Ordenação canônica:** por `date` ascendente; entradas sem data no início; empate por `id`.

**Derivação ao salvar o histórico:**

1. Ordenar canonicamente.
2. Última entrada → `belt` = sua faixa; `belt_since` = sua `date` (pode ser `""`).
3. Histórico vazio → `belt = ""`, `belt_since = ""`.

**Seed (v1):** se `belt` preenchido e histórico vazio:

- Uma entrada `{ id, belt, date: enrollmentDate || "" }`
- `belt_since` = essa `date`
- **Quando persiste:** no **create** do aluno (se `belt` informado) e na **primeira abertura do perfil** que detectar histórico vazio com `belt` legado (um `updateStudent` de seed, idempotente). Não seedar em massa na lista só por scroll.

**Cap:** máximo **50** entradas; ao tentar adicionar além, erro explícito (não truncar).

**Visibilidade:** mesma regra de `shouldShowStudentGraduation` / `graduationsActive` da spec de opt-in.

Documentar atributos em `docs/appwrite-setup.md` e provisionar no projeto Appwrite (CLI/script existente do time).

---

## 4. UI e fluxos

### 4.1 Perfil do aluno

- Seção **Histórico de {terms.belt}** (ex. “Histórico de faixas” / “Histórico de evolução”), só se graduações visíveis.
- Lista com mais recente no topo: faixa + data (ou “Data desconhecida”).
- Ações: adicionar, editar, excluir.
- Add/edit: select das opções configuradas + date (opcional).
- Campo **faixa atual** no bloco de dados: com graduações ativas, **sempre somente leitura** (valor derivado do histórico, inclusive após seed); copy curta apontando para o histórico. Sem graduações ativas, mantém o comportamento legado da spec de opt-in (oculto ou leitura de valor legado).

### 4.2 Cadastro rápido (lista Alunos)

- Se o create informar `belt` e graduações ativas: persistir seed de 1 entrada (`date` vazia, salvo se já houver ingresso no payload).

### 4.3 Lista Alunos — filtro

- Novo filtro: tempo na faixa atual — **≥ 3 / 6 / 12 / 24 meses** (+ limpar).
- Critério: `belt_since` ≤ (hoje − N meses), em calendário local.
- Alunos **sem** `belt_since`: **excluídos** do resultado quando o filtro de tempo está ativo.
- Card/linha da lista: **não** exibe “desde …” nesta v1 — só o filtro.

### 4.4 Fora desta entrega

Alertas, Retenção/Frequência, matrícula pública, lead, automação “parabéns pela faixa”.

---

## 5. Persistência e arquitetura

```
UI histórico  →  beltHistory.js (parse / sort / derive / seed)
              →  updateStudent({ belt_history_json, belt, belt_since })
              →  map/patch Appwrite + store
```

- Módulo puro compartilhado (ex. `src/lib/beltHistory.js`) com testes unitários.
- Um único patch atômico com os três campos derivados.
- Estender mapeamento (`mapAppwriteStudentDoc`), patch (`studentAppwritePatch` / store), e lista se necessário.
- **NL/agente:** com graduações ativas, **não** aplicar patch de `belt` via NL (histórico só pela UI). Sem graduações ativas, comportamento atual de `belt` permanece.

Sem arquivo novo em `/api/`.

---

## 6. Erros e edge cases

| Caso | Comportamento |
|------|----------------|
| Faixa fora de `beltGrades` | Rejeitar no add/edit (`normalizeBeltValue`) |
| Excluir todas as entradas | Limpa `belt` e `belt_since` |
| Seed com só `belt` legado | Entrada única; data = ingresso ou vazia |
| Atributo Appwrite ausente | Erro claro ao salvar; setup documentado |
| Cap 50 | Toast/erro; não grava |
| Filtro tempo sem `belt_since` | Aluno fora do resultado do filtro |

---

## 7. Testes

- **Unit (`beltHistory`):** seed, ordenação, derivação, histórico vazio, cap.
- **Unit (filtro):** ≥ N meses com/sem `belt_since`; timezone/data local estável nos fixtures.
- **UI (leve, se padrão existir):** salvar histórico manda payload com `belt`/`belt_since` derivados.

---

## 8. Abordagem escolhida (resumo)

**Histórico em JSON no aluno + `belt` / `belt_since` derivados** — não coleção separada; não só-JSON sem scalar (filtro frágil).

---

## 9. Critérios de aceite

1. Com graduações ativas, perfil mostra histórico; add/edit/delete persistem e atualizam faixa atual.
2. Aluno com `belt` legado e sem histórico recebe seed de uma entrada.
3. Com graduações ativas, faixa atual no formulário de dados não é editável diretamente (só via histórico).
4. Lista Alunos filtra por ≥ 3/6/12/24 meses usando `belt_since`.
5. NL não sobrescreve `belt` quando graduações estão ativas.
6. Sem nova Serverless Function; atributos documentados no setup Appwrite.
7. Sem UI de alerta/elegibilidade nesta entrega.

---

## 10. Decisões de produto (brainstorm)

| Pergunta | Decisão |
|----------|---------|
| Escopo | Histórico (B) + filtro lista (parte de C); **sem alerta** |
| Registro | Manual no perfil |
| Faixa atual | Sempre última entrada do histórico |
| Legado | Seed automático (faixa + data ingresso se houver) |
| Filtro | Só lista Alunos |
| Storage | JSON + derivados no documento do aluno |
