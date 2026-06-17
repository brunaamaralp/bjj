# Catraca Control iD — gaps de prioridade alta — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Implementado (2026-06-17) — F1–F4 + P0/P1/P2; QA manual em hardware pendente  
**TECH:** [2026-06-17-catraca-gaps-prioridade-alta-TECH.md](./2026-06-17-catraca-gaps-prioridade-alta-TECH.md)  
**Fluxo relacionado:** [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md)  
**Relacionado:** [cobranca-inadimplencia-PRODUCT.md](./2026-06-15-cobranca-inadimplencia-PRODUCT.md) (flag `overdue` na catraca)  
**Contexto:** comparativo com concorrente (gestão de catraca TopData / Control iD paralela)

---

## 1. Problem Statement

Academias que usam Control iD no Nave têm integração funcional (sync, feed ao vivo, liberação manual), mas **cinco lacunas de prioridade alta** impedem paridade operacional com concorrentes e geram risco de negócio:

1. **Inadimplentes entram normalmente** — a régua de cobrança existe no financeiro, mas não bloqueia acesso físico.
2. **Entradas duplicadas** — o mesmo aluno pode gerar várias presenças em sequência (sem anti-passback).
3. **Liberação manual sem auditoria** — não há registro de quem liberou nem por quê.
4. **Servidor local invisível** — o IP/URL do relay na recepção só existe em variáveis de ambiente; instaladores não configuram pela UI.
5. **Última sincronização oculta** — o backend expõe `last_sync`, mas o valor quase nunca é gravado e não aparece em Integrações.

Sem isso, gestores não confiam na catraca como controle de acesso; recepcionistas não têm trilha de auditoria; e suporte depende de acesso técnico ao servidor.

---

## 2. Goals

| # | Objetivo | Métrica de sucesso |
|---|----------|-------------------|
| G1 | Bloquear acesso na catraca para inadimplentes (quando habilitado) | Aluno com `overdue=true` e sync ativo é revogado em ≤5 min após marcação; re-sync automático após quitação |
| G2 | Evitar presenças duplicadas por janela configurável | Segunda entrada do mesmo aluno dentro do intervalo não cria novo registro de presença |
| G3 | Auditoria completa de liberação manual | 100% das liberações manuais gravam usuário, horário e justificativa consultáveis |
| G4 | Instalador configura relay pela UI | Academia salva URL do servidor local; teste de conexão usa esse endpoint |
| G5 | Visibilidade da última sync em Integrações | Campo legível após sync individual ou em massa; atualiza em tempo real após ação |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Suporte a TopData / catraca paralela | Ecossistema diferente; fora do escopo Control iD |
| Bloqueio físico no hardware (anti-passback no firmware) | v1 = deduplicação no servidor; hardware continua podendo abrir |
| Justificativa obrigatória com workflow de aprovação | Apenas texto livre + registro |
| Bloqueio por inadimplência sem módulo financeiro | Toggle desabilitado se financeiro inativo |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 — rotas em handlers existentes |
| Exportação CSV de auditoria de liberações | Fase futura; v1 consulta via timeline / histórico |

---

## 4. Personas e user stories

### Gestor / owner

- **US1:** Como gestor, quero **bloquear inadimplentes na catraca** para que mensalidade atrasada impeça entrada sem depender da recepcionista.
- **US2:** Como gestor, quero **definir minutos entre entradas** para que presença não seja contada várias vezes no mesmo intervalo.
- **US3:** Como gestor, quero **ver quando foi a última sincronização** de alunos com o equipamento.

### Instalador / suporte

- **US4:** Como instalador, quero **informar o IP do servidor na recepção** na tela de Integrações para que a nuvem alcance a catraca na rede local.

### Recepcionista

- **US5:** Como recepcionista, quero **informar o motivo ao liberar a catraca** para que fique registrado quem autorizou visitante ou exceção.
- **US6:** Como recepcionista, quero que a **justificativa seja rápida** (campo curto + confirmação) para não atrasar a fila.

### Edge cases

- **US7:** Aluno inadimplente com trancamento ativo — já revogado por trancamento; bloqueio por inadimplência não deve conflitar.
- **US8:** Pagamento registrado à tarde — aluno deve voltar a ter acesso após sync automático.
- **US9:** Liberação manual durante cooldown — não conta como entrada de aluno; não dispara anti-passback.
- **US10:** Relay URL inválida — teste de conexão mostra erro claro (“servidor local inacessível”).

---

## 5. UX — Integrações → Catraca

Estender `ControlIdCatracaSection` com campos agrupados em **subtítulos** (Servidor local, Conexão, Regras de acesso, Status).

### Seção: Servidor local

| Campo | Tipo | Default | Ajuda |
|-------|------|---------|-------|
| URL do servidor na recepção | texto | vazio (fallback env global) | Ex.: `http://192.168.18.61:4000` — computador que roda o relay na academia |

### Seção: Regras de acesso

| Campo | Tipo | Default | Ajuda |
|-------|------|---------|-------|
| Bloquear inadimplentes na catraca | checkbox | desligado | Remove acesso no equipamento quando o aluno está marcado como inadimplente |
| Intervalo mínimo entre entradas (min) | número 0–240 | `0` (desligado) | Ignora nova presença se o mesmo aluno entrou há menos tempo |

**Nota:** Bloquear inadimplentes só habilitável se a academia tiver módulo financeiro ativo; caso contrário, checkbox desabilitado com link para Financeiro.

### Seção: Status

| Elemento | Comportamento |
|----------|---------------|
| Última sincronização | Texto somente leitura: “Nunca sincronizado” ou data/hora formatada (ex.: `17/06/2026 14:32`) |
| Botão “Sincronizar todos agora” | Link para `/?tab=catraca&section=historico` na seção Status |

---

## 6. UX — Liberação manual com justificativa

**Onde:** Hoje (`Dashboard`), feed ao vivo (`RecepcaoLivePanel`), histórico (`ControlIdAttendancePanel`).

**Fluxo:**

1. Usuário clica **Liberar catraca**.
2. Abre `ControlIdReleaseDialog` com:
   - Título: “Liberar passagem?”
   - Campo obrigatório: **Motivo** (textarea, 3–500 caracteres)
   - Sugestões rápidas (chips): “Visitante”, “Entrega”, “Manutenção”, “Exceção autorizada”
3. Confirmar só habilitado com motivo válido.
4. Toast de sucesso: “Catraca liberada.”
5. Feed ao vivo registra linha “Liberação manual” com trecho do motivo (truncado) + hora.

**Permissões:** `ensureAcademyAccess` no release — qualquer membro do time da academia (inclui recepcionista); justificativa obrigatória para todos.

---

## 7. Comportamento — Bloqueio por inadimplência

### Quando ligado (`block_overdue_access: true`)

| Evento | Ação esperada |
|--------|---------------|
| Aluno marcado `overdue: true` (cron ou pagamento) | Se `controlid_synced`, **revogar** usuário no equipamento |
| Aluno quita débitos (`overdue` limpo) | Se ativo, com foto e integração ativa, **re-sincronizar** |
| Tentativa de entrada com overdue ainda no dispositivo | Servidor **não grava presença**; `attendance_denied` na timeline; linha «ignorada» no feed ao vivo |
| Aluno sem foto / nunca sincronizado | Nada a revogar; sem erro |

### Quando desligado

Comportamento atual — inadimplência só afeta financeiro e etiquetas.

### Alinhamento com régua

- Usa flag `student.overdue` já persistida (cron diário + sync pós-pagamento).
- **Não** recalcula fila de cobrança na catraca — fonte única é o documento do aluno.

---

## 8. Comportamento — Anti-passback (intervalo entre entradas)

| Config | Comportamento |
|--------|---------------|
| `0` | Desligado — cada evento gera presença (comportamento atual) |
| `N > 0` | Se última presença do **mesmo aluno** na academia foi há menos de N minutos, **ignorar** novo registro (não criar attendance, não duplicar timeline) |

**Escopo:**

- Aplica-se apenas a eventos de catraca identificados com aluno (`controlid_user_id`).
- **Não** aplica a liberação manual.
- Eventos ignorados: contadores `skipped_cooldown` / `skipped_overdue` e array `ignored` no monitor; feed ao vivo exibe entradas ignoradas (amarelo).

**Limitação explícita (v1):** O equipamento pode ainda abrir a porta; o Nave evita **presença duplicada** e métricas infladas. Bloqueio físico no relay é non-goal.

---

## 9. Acceptance criteria

> Validado em código + testes unitários (2026-06-17). Itens com ⚠️ exigem QA manual com relay + hardware.

### Bloqueio inadimplência

- [x] Checkbox em Integrações → Catraca, persistido por academia
- [x] Desabilitado com link para Financeiro se financeiro inativo
- [x] Aluno inadimplente sincronizado é revogado após marcação `overdue` ⚠️
- [x] Aluno regularizado é re-sincronizado (se ativo + foto) ⚠️
- [x] Entrada com `overdue=true` não grava presença quando bloqueio ativo
- [x] Sync individual e sync-all **não** re-sincronizam inadimplentes com bloqueio ativo
- [x] Badge «Catraca: bloqueado» na lista de alunos quando `overdue` + flag ativa
- [x] Trancamento continua revogando independentemente do toggle

### Anti-passback

- [x] Campo minutos em Integrações, 0–240 (clamp no save)
- [x] Segunda entrada dentro do intervalo não cria attendance nem evento `attendance` duplicado
- [x] Entrada após intervalo cria presença normalmente
- [x] Liberação manual não afeta cooldown do aluno
- [x] Feed ao vivo mostra entrada ignorada por cooldown

### Justificativa

- [x] Liberar exige motivo (3–500 chars) em Hoje, Ao vivo e Histórico
- [x] `lead_events` registra `manual_release` com `reason`, `released_by`, `released_by_name`
- [x] Feed mostra liberação manual com indicação do motivo (resumo)
- [x] Liberação sem motivo retorna erro 400
- [x] Timeline com rótulos `manual_release`, `attendance`, `attendance_denied`

### IP / URL servidor

- [x] Campo URL do relay salvo em `academy.settings.controlid.relay_url`
- [x] Vazio → fallback `CONTROLID_RELAY_URL` (env)
- [x] Testar conexão usa relay da academia
- [x] URL inválida: validação no save + mensagem amigável no teste

### Última sincronização

- [x] `last_sync` gravado em ISO UTC após sync individual bem-sucedido e sync-all
- [x] Exibido em Integrações → Catraca (somente leitura)
- [x] Exibido no histórico da catraca (`ControlIdAttendancePanel`)
- [x] `GET /api/control-id/status` retorna valor atualizado
- [x] “Nunca sincronizado” quando vazio

### Regressão

- [x] Academia sem novos campos continua funcionando (defaults seguros)
- [x] Nenhum arquivo novo em `/api/`
- [x] Fluxo [recepcao-controlid.md](../../flows/crm/recepcao-controlid.md) atualizado

---

## 10. Success metrics

| Indicador | Tipo | Meta (30 dias pós-release) |
|-----------|------|----------------------------|
| Academias com bloqueio inadimplência ativo | Adoção | ≥30% das academias com Control iD + financeiro |
| Liberações manuais com motivo preenchido | Qualidade | 100% (validação server-side) |
| Tickets suporte “catraca não conecta” resolvidos via UI relay | Suporte | Redução qualitativa (baseline manual) |
| Presenças duplicadas mesmo aluno &lt;5 min | Operação | Redução ≥80% em academias com cooldown ≥15 min |

---

## 11. Open questions

| # | Pergunta | Responsável | Bloqueante? |
|---|----------|-------------|-------------|
| OQ1 | Cooldown default sugerido: `0` ou `15` min? | Produto | **Resolvido:** default `0` |
| OQ2 | Exibir motivo completo da liberação no histórico de presenças ou só na timeline do lead? | Produto | **Resolvido:** timeline + resumo no feed |
| OQ3 | Re-sync automático ao quitar: imediato ou apenas no próximo sync manual? | Engenharia | **Resolvido:** imediato em background (`scheduleControlIdOverdueReconcile`) |
| OQ4 | Chips de motivo rápido na liberação — incluir na v1? | Design | **Resolvido:** sim, em `ControlIdReleaseDialog` |

---

## 12. Fases sugeridas

| Fase | Entregas | Risco |
|------|----------|-------|
| **F1** | Última sync visível + gravação; URL relay na UI | Baixo |
| **F2** | Justificativa na liberação manual | Baixo |
| **F3** | Anti-passback (cooldown) | Médio |
| **F4** | Bloqueio inadimplência (revoke + re-sync) | Alto — cross módulo financeiro |

Fases entregues em sequência (F1 → F4) + correções P0/P1/P2 de integração e UX.

---

## 13. Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Implementado F1–F4; critérios de aceite marcados; OQs resolvidas |
| 2026-06-17 | Rascunho inicial — 5 gaps prioridade alta |
