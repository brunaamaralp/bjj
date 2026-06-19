# Graduação do aluno — cadastro, perfil e opt-in multi-vertical

**Data:** 2026-06-19  
**Status:** rascunho — aguardando aprovação  
**TECH:** [2026-06-19-graduacao-aluno-opt-in-TECH.md](./2026-06-19-graduacao-aluno-opt-in-TECH.md)

**Contexto:** conversa de produto sobre expor o campo de faixa/graduação no cadastro de aluno sem reforçar que o Nave é exclusivo de academias de luta. A infraestrutura (`belt`, `beltGrades`, filtros em relatórios/retenção) já existe; a UI de cadastro e perfil ainda não consome essa configuração de forma coerente.

**Fluxos relacionados:**

- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md)
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)
- [onboarding-academia.md](../../flows/config/onboarding-academia.md)
- [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md) — filtros turma/faixa na retenção
- [relatorios-indicadores.md](../../flows/analise/relatorios-indicadores.md) — coluna/filtro faixa em Frequência

**Specs relacionadas:**

- [2026-06-17-retencao-frequencia-ux-evolucao-PRODUCT.md](./2026-06-17-retencao-frequencia-ux-evolucao-PRODUCT.md) — filtros `ret_belt` / `freq_belt` já consomem `student.belt`
- [2026-06-11-conversa-cadastro-lead-ia.md](../plans/2026-06-11-conversa-cadastro-lead-ia.md) — NL já permite patch em `belt`

**Mock Figma:** não disponível — wireframes ASCII e critérios visuais abaixo.

---

## 1. Inventário — o que já existe

| Camada | Estado | Evidência |
|--------|--------|-----------|
| Atributo Appwrite `belt` em leads/alunos | ✅ Persistido | `docs/appwrite-setup.md`, `mapAppwriteStudentDoc.js` |
| Config **Empresa → Alunos → Graduações** | ✅ UI de lista editável | `BeltGradesSection.jsx`, `beltGradesConfig.js` |
| Padrão BJJ quando lista vazia | ⚠️ Só preview na config | `DEFAULT_BELT_GRADES` — Branca…Preta |
| Terminologia por vertical | ✅ | `terms.belt` → **Faixa** (fitness) / **Evolução** (physio) |
| Filtros relatório / retenção por faixa | ✅ | `ReportsFrequenciaPanel`, `AttendanceAtRiskSection` |
| Atualização via NL / agente | ✅ | `studentNlUpdates.js` — `belt` permitido |
| Perfil do aluno | ❌ Campo ausente | `STUDENT_DATA_FIELDS` sem `belt` |
| Cadastro rápido (lista Alunos) | ❌ Campo ausente | `useStudentsCreateForm.js` |
| Matrícula online pública | ❌ Campo ausente | `PublicStudentEnrollment.jsx` |
| Perfil do lead (pré-matrícula) | ❌ Campo ausente | `LeadProfile.jsx` |
| Labels hardcoded “Faixa” | ⚠️ Parcial | `ReportsFrequenciaPanel.jsx` linha de coluna |
| Copy config “exibidas no cadastro” | ⚠️ Incorreta hoje | `BeltGradesSection` promete cadastro que não existe |

**Conclusão:** não criar campo novo. Completar a UI reutilizando `belt` + `beltGrades` + `terms.belt`, com **visibilidade opt-in** para academias que não usam graduação.

---

## 2. Problema

1. **Academias de luta** não conseguem registrar a faixa do aluno no fluxo natural (perfil / matrícula), embora relatórios e retenção já filtrem por esse dado.
2. **Academias não-martial** (pilates, crossfit, clínica) veem sinais de produto “de faixa” (padrão BJJ, copy “Faixa” fixa) sem optar por usar graduação.
3. **Inconsistência** entre config (“exibidas no cadastro”), dados persistidos e superfícies visíveis gera desconfiança e suporte desnecessário.

**Quem é afetado:** owner/admin (configura graduações), recepcionista (cadastra e edita aluno), gestor (filtra relatórios/retenção).

**Custo de não resolver:** faixa desatualizada ou vazia nos filtros analíticos; academias genéricas percebem o Nave como “só BJJ”; retrabalho manual fora do sistema.

---

## 3. Goals

| # | Meta |
|---|------|
| G1 | Owner configura graduações **uma vez** e o campo aparece **automaticamente** onde faz sentido (perfil + cadastro) |
| G2 | Academias que **não** usam graduação **não veem** o campo no dia a dia (zero fricção visual) |
| G3 | Rótulo sempre correto para a vertical (**Faixa** vs **Evolução**) — nunca hardcoded “Faixa” na UI dinâmica |
| G4 | Valor de `belt` alimenta filtros existentes em **Frequência** e **Retenção** sem regressão |
| G5 | Fluxo de matrícula permanece rápido — graduação **opcional**, nunca bloqueia matricular |

---

## 4. Non-Goals (esta spec)

| Item | Motivo |
|------|--------|
| Histórico de promoções / timeline de graduação | Escopo futuro; v1 só valor atual |
| Cerimônia de graduação, cobrança de exame, certificado | Fora do CRM operacional |
| Campo personalizado livre substituindo `belt` | Quebra filtros estruturados |
| Novo atributo Appwrite ou arquivo em `/api/` | Reutilizar `belt`; limite Vercel Hobby 12/12 |
| Obrigatoriedade de graduação na matrícula | Recepcionista precisa matricular rápido |
| Graduação no funil de lead (pré-matrícula) | Graduação é atributo de aluno matriculado; lead só herda na conversão se já preenchido |
| Automação “parabéns pela nova faixa” | Pode virar spec separada de automações |
| Importação em massa com mapeamento novo de coluna | Se import já aceita `belt`, documentar; não expandir escopo de import nesta entrega |

---

## 5. Modelo de produto — opt-in por configuração

### 5.1 Regra de visibilidade (invariante)

Definir **graduações ativas** quando a academia salvou ao menos uma opção em `settings.beltGrades` (array não vazio após persistência).

| Condição | Comportamento |
|----------|---------------|
| `beltGrades` **vazio** (nunca configurou ou removeu tudo) | Campo **oculto** em cadastro, perfil e matrícula online |
| `beltGrades` **com itens** | Campo **visível** como `<select>` com opções configuradas |
| Aluno com `belt` preenchido e academia **desativou** graduações depois | Campo **visível em leitura** no perfil (valor legado); edição permitida só se graduações reativadas **ou** valor migrado manualmente |

**Importante:** a lista padrão BJJ (`DEFAULT_BELT_GRADES`) **não** ativa o campo sozinha. Só conta após o owner clicar **Salvar graduações** (inclusive após “Restaurar padrões”).

### 5.2 Rótulos e copy

| Contexto | Rótulo |
|----------|--------|
| Vertical `fitness` | `terms.belt` → **Faixa** |
| Vertical `physio` | `terms.belt` → **Evolução** |
| Seção de config | Manter **Graduações** (neutro) |
| Hint na config | _“Níveis de evolução do aluno (faixa, módulo, fase…). Salve a lista para exibir no cadastro. Deixe vazio para ocultar.”_ |

### 5.3 Valor persistido

- Campo técnico: `belt` (string, até 256 chars — alinhado a NL)
- Opções do select: exatamente `beltGrades` configuradas
- Opção vazia no select: “Selecione…” / em branco — **não obrigatório**
- Valor fora da lista (legado/import): exibir valor + opção extra no select (“Atual: Roxa”) até o usuário corrigir

---

## 6. Personas e user stories

### Owner / admin

**US-A1** — Como owner de academia de Jiu-Jitsu, quero **salvar minhas faixas** em Graduações e ver o campo **Faixa** no perfil do aluno, para manter relatórios e retenção coerentes.

**US-A2** — Como owner de estúdio de pilates, quero **não ver faixa** no cadastro até eu configurar níveis próprios (Iniciante, Intermediário…), para o sistema não parecer exclusivo de luta.

**US-A3** — Como owner, quero entender na config que graduações são **opcionais** e só aparecem após salvar, para não prometer campo fantasma.

### Recepcionista

**US-R1** — Como recepcionista, quero **definir ou alterar a graduação** no perfil do aluno inline (como turma/plano), sem abrir modal pesado.

**US-R2** — Como recepcionista no cadastro rápido, quero **opcionalmente** escolher a graduação quando a academia usa esse controle.

**US-R3** — Como recepcionista, quero que alunos **sem graduação** não mostrem linha vazia “Faixa: —” quando a academia não usa o recurso.

### Gestor

**US-G1** — Como gestor em Relatórios → Frequência, quero filtrar por graduação com rótulo **Faixa/Evolução** correto, não texto fixo de luta.

**US-G2** — Como gestor na fila de retenção, quero ver turma · graduação na linha quando preenchidos (já parcialmente existe).

---

## 7. Requisitos por prioridade

### P0 — Perfil do aluno + config coerente

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-01 | Campo graduação no **perfil do aluno** (`StudentProfile`) | Select inline quando graduações ativas; label = `terms.belt`; salva via fluxo existente de `saveStudentProfileField` / patch em `belt` |
| R-02 | **Ocultar** campo quando graduações inativas | Sem linha no perfil se `belt` vazio e `beltGrades` vazio |
| R-03 | **Legado** com valor e graduações desativadas | Mostrar valor em modo leitura + hint “Reative em Empresa → Alunos → Graduações para editar” |
| R-04 | Atualizar copy em **BeltGradesSection** | Remover “exibidas no cadastro” até P1; usar hint da §5.2; preview dos padrões BJJ rotulado como “(exemplo — salve para ativar)” |
| R-05 | Helper compartilhado `graduationsActive(settings)` | Função pura em `beltGradesConfig.js`; usada por perfil, cadastro e matrícula online |
| R-06 | Lista de opções `resolveBeltOptions(settings)` | Retorna `beltGrades` se ativo; senão `[]`; inclui valor atual do aluno se órfão |

### P1 — Cadastro interno + labels

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-07 | Campo opcional no **cadastro rápido** (`Students.jsx` / `useStudentsCreateForm`) | Select só se graduações ativas; persiste `belt` no `addStudent` |
| R-08 | Herança na **matrícula pelo funil** | Ao converter lead → aluno, copiar `belt` se existir (já no payload; validar paridade) |
| R-09 | Substituir **“Faixa” hardcoded** em relatórios/retenção | `ReportsFrequenciaPanel`, filtros e colunas usam `terms.belt`; placeholder do filtro idem |
| R-10 | Toast/erro segue [ux-feedback.md](../../ux-feedback.md) | `useToast` em saves; `FieldError` se validação futura |

### P2 — Matrícula online e polish

| ID | Requisito | Aceite |
|----|-----------|--------|
| R-11 | Campo opcional na **matrícula online** | `PublicStudentEnrollment.jsx` — select quando graduações ativas; envia `belt` no POST |
| R-12 | Toggle **“Pedir graduação na matrícula online”** | Sub-flag em `publicEnrollment` settings (default **off** mesmo com graduações ativas); só exibe se graduações ativas **e** toggle on |
| R-13 | Resumo na lista de alunos (opcional) | Coluna ou chip secundário **somente se** graduações ativas — avaliar densidade; pode cortar se apertado |
| R-14 | Testes unitários | `graduationsActive`, `resolveBeltOptions`, render condicional (RTL mínimo) |

---

## 8. Wireframes ASCII (referência)

### Perfil do aluno — graduações ativas (R-01)

```
┌─ Dados do aluno ─────────────────────┐
│ Nome          Maria Silva            │
│ Plano         Mensal                 │
│ Turma         Noite                  │
│ Faixa         [ Azul            ▼ ]  │  ← terms.belt
│ Telefone      (11) 99999-9999        │
└──────────────────────────────────────┘
```

### Perfil — graduações inativas, sem valor (R-02)

```
(Campo Faixa/Evolução ausente — layout igual aos demais campos visíveis)
```

### Config Graduações — antes de salvar (R-04)

```
Graduações
Níveis de evolução do aluno… Salve a lista para exibir no cadastro.

  1. Branca (exemplo — salve para ativar)
  2. Azul   (exemplo — salve para ativar)
  …
[ + Nova faixa ]  [ Salvar graduações ]
```

### Cadastro rápido — opcional (R-07)

```
Nome *     [________________]
Telefone * [________________]
Plano *    [ Mensal        ▼]
Turma      [ Noite         ▼]
Faixa      [ — opcional —  ▼]   ← omitido inteiro se graduações inativas
[ Matricular ]
```

---

## 9. Success metrics

| Tipo | Métrica | Alvo (30 dias pós-release) |
|------|---------|----------------------------|
| Leading | % academias com `beltGrades` salvo | Baseline + crescimento orgânico (sem meta rígida v1) |
| Leading | % alunos ativos com `belt` preenchido (só academias com graduações ativas) | ≥ 40% nas academias que ativaram |
| Leading | Uso de filtro por graduação em Frequência | ≥ 15% das sessões que abrem o painel (academias ativas) |
| Qualidade | Zero regressão em testes de attendance/retenção | CI verde |
| Qualidade | Nenhuma academia com graduações inativas reporta campo “Faixa” visível | QA manual + spot check |

---

## 10. Fases de entrega sugeridas

| Fase | Escopo | PR |
|------|--------|-----|
| **E1** | R-01 a R-06 — perfil + helpers + copy config | 1 PR pequeno-médio |
| **E2** | R-07 a R-10 — cadastro interno + labels relatórios | 1 PR pequeno |
| **E3** | R-11 a R-14 — matrícula online + toggle + testes | 1 PR pequeno |

Ordem: **E1 → E2 → E3**. E2 pode iniciar em paralelo após R-05 mergeado.

---

## 11. Open questions

| # | Pergunta | Dono | Proposta default |
|---|----------|------|------------------|
| Q1 | Matrícula online: toggle separado ou sempre mostrar quando graduações ativas? | Produto | **Toggle separado** (R-12) — recepção define faixa depois |
| Q2 | Exibir graduação na **lista** de alunos? | Produto | **P2 opcional** (R-13); cortável |
| Q3 | Lead pré-matrícula pode ter faixa? | Produto | **Não** nesta spec; só aluno matriculado |
| Q4 | Renomear chave técnica `belt` → `graduation` no banco? | Eng | **Não** — breaking change; só UI muda |
| Q5 | Vertical além de fitness/physio precisa de terceiro rótulo? | Produto | **Não v1**; lista livre + “Graduações” basta |

---

## 12. Governança de docs

Atualizar no mesmo PR de cada fase:

- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md) — campo graduação opt-in
- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md) — cadastro rápido + matrícula online
- [onboarding-academia.md](../../flows/config/onboarding-academia.md) — passo opcional Graduações
- [relatorios-indicadores.md](../../flows/analise/relatorios-indicadores.md) — rótulo dinâmico
- [VALIDATION.md](../../flows/VALIDATION.md) — se checklist divergir

---

## 13. Critérios de aceite globais

- [ ] Nenhum novo arquivo em `/api/`
- [ ] Campo oculto por default (lista `beltGrades` vazia) em **todas** as superfícies de cadastro/perfil
- [ ] Rótulos via `useTerms().belt` — zero “Faixa” hardcoded em componentes de aluno (exceto exemplos estáticos na config BJJ)
- [ ] Valor salvo em `belt` reflete nos filtros `freq_belt` / `ret_belt` existentes
- [ ] Toasts/erros seguem [docs/ux-feedback.md](../../ux-feedback.md)
- [ ] Testes unitários para helpers puros (R-05, R-06)
- [ ] QA manual: academia sem graduações (pilates), academia BJJ com faixas, aluno legado com faixa após desativar config, matrícula online com toggle on/off
