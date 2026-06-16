# Recepção — Control iD (ao vivo e histórico)

| Campo | Valor |
|---|---|
| **id** | `crm.recepcao.controlid` |
| **módulo** | CRM / Operação |
| **personas** | recepcionista, owner, admin |
| **rotas** | `/recepcao`, `/recepcao?tab=historico`, `/integracoes?tab=catraca` (setup) |
| **pré-requisitos** | Academia com alunos; hardware Control iD na rede local; servidor/ponte na recepção (quando aplicável) |
| **status** | revisado (código) |
| **última revisão** | 2026-06-15 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:** —

**Harness relacionado:** `bootstrapRoutePrefetch.test.js` (`/recepcao` exige bootstrap de alunos)

**Arquivos-chave:** `src/pages/Recepcao.jsx`, `src/components/attendance/RecepcaoLivePanel.jsx`, `src/components/attendance/ControlIdAttendancePanel.jsx`, `src/components/academy/ControlIdCatracaSection.jsx`, `src/lib/controlidApi.js`, `lib/server/controlidHandlers.js`

**Fluxo relacionado:** [aluno-perfil-presenca.md](aluno-perfil-presenca.md) (perfil do aluno, foto na catraca)

---

## Resumo

A **Recepção** é a tela operacional para o dia a dia na porta da academia: feed **ao vivo** de entradas pela catraca Control iD, **liberação manual** da porta e **histórico** filtrável. A configuração do equipamento fica em **Integrações → Catraca**; o modo recepção em `/recepcao` é o caminho canônico para presença (preferir em relação a `/students?view=presenca` no hub embutido).

---

## Diagrama de fluxo

```mermaid
flowchart TD
  setup[Integrações → Catraca] --> test[Testar conexão IP/credenciais]
  test --> save[Salvar config enabled]
  save --> sync[Sincronizar alunos na catraca]
  sync --> recepcao["/recepcao — Ao vivo"]
  recepcao --> poll[Poll monitor a cada N seg]
  poll --> event[Evento de acesso]
  event --> attendance[Grava presença + timeline lead]
  recepcao --> manual[Liberar catraca manual]
  recepcao --> hist["?tab=historico"]
  hist --> filters[Filtro hoje/semana/mês]
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | `/integracoes?tab=catraca` | `ControlIdCatracaSection` | Ativar integração | Checkbox «Integração ativa» |
| 2 | Catraca | Testar conexão | IP, porta, usuário, senha | Lista de portais; toast sucesso |
| 3 | Catraca | Salvar | `saveControlIdConfig` | Config persistida por academia |
| 4 | `/recepcao` | `Recepcao` | Abrir recepção | Aba default **Ao vivo** |
| 5 | Ao vivo | `RecepcaoLivePanel` | Ver status dispositivo | Online / offline / não configurado |
| 6 | Ao vivo | **Liberar catraca** | `releaseControlIdGate` | Toast; entrada manual no feed |
| 7 | Ao vivo | Feed entradas hoje | Poll automático | Novos registros com hora e link ao perfil |
| 8 | `?tab=historico` | `ControlIdAttendancePanel` | Trocar período | Hoje, 7 dias, 30 dias, etc. |
| 9 | Histórico | Atualizar / sync | `syncAllControlId` | Toast com contagem sincronizada |
| 10 | Histórico | Liberar catraca | Mesmo endpoint de release | Liberação remota |
| 11 | `/` Hoje | Atalho catraca (se configurado) | Liberar catraca | `ConfirmDialog` + release |
| 12 | `/student/:id` | Foto Control iD | Sincronizar rosto | `StudentControlIdPhoto` quando integração ativa |

### Abas da recepção

| Tab | Conteúdo |
|---|---|
| `ao-vivo` (default) | Status, liberar porta, feed do dia |
| `historico` | Lista agrupada por data, filtros, sync em massa |

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] `academyId` no contexto da sessão
- [ ] Integração ativa em `/integracoes?tab=catraca`
- [ ] Alunos com `controlid_user_id` (ou legado `device_id`) após sync
- [ ] Rede local alcança IP da catraca (ou `VITE_CONTROLID_API_BASE` em dev)

### Permissões

| Papel | Ver recepção | Configurar catraca | Liberar porta |
|---|---|---|---|
| **owner** | Sim | Sim | Sim |
| **admin** | Sim | Sim | Sim |
| **member** (recepcionista) | Sim | Via menu Integrações se tiver acesso à conta | Sim |

APIs usam `ensureAcademyAccess` + JWT; dados isolados por `academyId`.

### Checklist passo a passo — setup

1. [ ] Menu usuário → **Integrações** → aba **Catraca**
2. [ ] Marcar «Integração ativa»
3. [ ] Preencher IP, porta, usuário; senha na primeira vez ou ao retestar
4. [ ] **Testar conexão** → portais listados
5. [ ] Selecionar portal e **Salvar**
6. [ ] No histórico (ou painel de alunos), **Sincronizar todos** se necessário

### Checklist passo a passo — operação diária

1. [ ] Abrir `/recepcao` (voltar para Alunos via link no topo)
2. [ ] Status **Online** com IP visível quando polling OK
3. [ ] Entrada na catraca aparece no feed em até um ciclo de poll (~intervalo configurado no painel)
4. [ ] **Liberar catraca** habilitado só com integração configurada
5. [ ] Clique em «ver perfil» abre `/student/:id`
6. [ ] Aba **Histórico** carrega registros do período
7. [ ] Troca de academia recarrega feed e status

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Catraca não configurada | Botão liberar desabilitado; link para Integrações | `RecepcaoLivePanel` → `/integracoes?tab=catraca` |
| Poll falha | Status **Offline** | `deviceOnline = false` |
| Sync parcial | Toast warning com `failed` | `syncAllControlId` |
| Release falha | Toast erro `friendlyError` | `useToast` |
| Aluno sem vínculo na catraca | Evento ignorado no servidor | `processAccessEvent` retorna null |

### Critérios de fluxo saudável vs regressão

**Saudável:** integração ativa, poll estável, presenças deduplicadas por `device_log_id`, timeline do lead com evento `attendance`.

**Regressão:** feed não atualiza com aba visível; liberar manual sem toast; histórico vazio com entradas no dia; leak entre academias.

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 3 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Aluno | Ana Costa — já sincronizada na catraca |
| IP catraca | 192.168.1.100 (rede da academia) |
| Entrada simulada | 18:04 — reconhecimento facial |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | Integrações → Catraca | "Conectamos o Control iD uma vez; IP e portal salvos por academia." | Setup único |
| 2 | `/recepcao` Ao vivo | "Na recepção, o feed mostra quem entrou hoje em tempo real." | Operação visual |
| 3 | Liberar catraca | "Visitante ou entrega? Um toque libera a porta." | Flexibilidade |
| 4 | Perfil aluno | "Cada entrada alimenta o histórico de presença do aluno." | CRM integrado |
| 5 | Histórico | "Filtro por semana para conferência de frequência." | Gestão |

### O que não mostrar

- Senha do equipamento Control iD
- `controlid_user_id` interno
- Logs do servidor local / console

---

## Variações e atalhos

- **Hoje:** botão «Liberar catraca» no dashboard quando integração habilitada (carregamento adiado do status)
- **Alunos:** `ControlIdAttendancePanel` em `view=presenca` com link «Modo recepção» → `/recepcao`
- **Legado:** `/presenca` redireciona; preferir `/recepcao`
- **Dev:** `VITE_CONTROLID_API_BASE` aponta para ponte local
- **API:** rotas via `api/leads?route=controlid_*` e `GET /api/control-id/status`

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-15 | — | Criação inicial |
