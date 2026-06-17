# Jornadas do usuário (Nave)

Documentação end-to-end dos fluxos do Nave para **auditoria operacional** e **roteiros de demonstração em vídeo**.

Cada fluxo tem duas seções de público:

- **Seção A — Auditoria:** checklist verificável para produto, suporte e QA.
- **Seção B — Demo:** narração e dados fictícios para gravação de vídeo ou treinamento.

## Como este diretório se relaciona com o resto da documentação

| Camada | Onde | Propósito |
|---|---|---|
| **Fluxos (este diretório)** | `docs/flows/` | Jornadas completas do usuário |
| Specs de feature | `docs/superpowers/specs/` | Requisitos e aceite por feature — linkar, não duplicar |
| Harness de QA | `docs/harness/`, `HARNESS.md` | Testes Vitest e QA técnico — referenciar |
| Guias de UI | `DESIGN_SYSTEM.md`, `docs/ux-feedback.md` | Padrões de componente |

**Regra:** mudança de rota ou navegação → atualizar o fluxo no mesmo PR.

**Governança para agents:** ver [AGENTS.md](../../AGENTS.md) (seção Jornadas do usuário) e rule `.cursor/rules/docs-user-flows.mdc` (dispara em `App.jsx`, `naviMenu.js`, `src/pages/*`).

## Validação

Relatório de validação estática (código + testes): [VALIDATION.md](VALIDATION.md).

**Auditoria salvamento (Financeiro, 2026-06-16):** matriz de 10 cenários + harness `mensalidadesPaymentForm financeConfigValidation` — ver seção dedicada em VALIDATION.md. Staging manual ainda pendente.

Status `revisado` = conferido contra código; execução manual em staging ainda recomendada antes de gravar vídeo.

## Legenda de status

| Status | Significado |
|---|---|
| `rascunho` | Estrutura criada; pendente validação em staging |
| `revisado` | Conferido contra código (ver [VALIDATION.md](VALIDATION.md)); staging manual pendente |
| `revisado-staging` | Checklist executado manualmente em ambiente de teste |
| `gravado-em-video` | Roteiro usado em gravação oficial |

## Índice por módulo

### CRM

| Fluxo | Arquivo | Status |
|---|---|---|
| Recepção — mesa do dia | [crm/hoje-dashboard.md](crm/hoje-dashboard.md) | revisado (código) |
| Funil — lead à matrícula | [crm/funil-lead-matricula.md](crm/funil-lead-matricula.md) | revisado (código) |
| Alunos — perfil e presença | [crm/aluno-perfil-presenca.md](crm/aluno-perfil-presenca.md) | revisado (código) |
| Tarefas — operação diária | [crm/tarefas-operacao.md](crm/tarefas-operacao.md) | revisado (código) |
| Conversas — inbox WhatsApp | [crm/conversas-inbox.md](crm/conversas-inbox.md) | revisado (código) |
| Recepção — Control iD | [crm/recepcao-controlid.md](crm/recepcao-controlid.md) | revisado (código) |

### Análise

| Fluxo | Arquivo | Status |
|---|---|---|
| Relatórios — indicadores | [analise/relatorios-indicadores.md](analise/relatorios-indicadores.md) | revisado (código) |

### Financeiro — Fase 2A (operações)

| Fluxo | Arquivo | Status |
|---|---|---|
| A receber — mensalidades | [financeiro/a-receber-mensalidades.md](financeiro/a-receber-mensalidades.md) | revisado (código) |
| A pagar — contas fixas | [financeiro/a-pagar-contas-fixas.md](financeiro/a-pagar-contas-fixas.md) | revisado (código) |
| Lançamentos — caixa | [financeiro/lancamentos-caixa.md](financeiro/lancamentos-caixa.md) | revisado (código) |
| Conciliação bancária | [financeiro/conciliacao-bancaria.md](financeiro/conciliacao-bancaria.md) | revisado (código) |
| Conferência do mês | [financeiro/fechamento-mensal.md](financeiro/fechamento-mensal.md) | revisado (código) |

### Financeiro — Fase 2B (setup)

| Fluxo | Arquivo | Status |
|---|---|---|
| Config inicial do financeiro | [financeiro/config-inicial-financeiro.md](financeiro/config-inicial-financeiro.md) | revisado (código) |
| Plano de contas e categorias | [financeiro/plano-contas-categorias.md](financeiro/plano-contas-categorias.md) | revisado (código) |

### Vendas

| Fluxo | Arquivo | Status |
|---|---|---|
| PDV e nova venda | [vendas/pdv-nova-venda.md](vendas/pdv-nova-venda.md) | revisado (código) |
| Produtos e catálogo | [vendas/produtos-catalogo.md](vendas/produtos-catalogo.md) | revisado (código) |
| Estoque e movimentações | [vendas/estoque-movimentacoes.md](vendas/estoque-movimentacoes.md) | revisado (código) |

### Atendimento

| Fluxo | Arquivo | Status |
|---|---|---|
| Agente IA e WhatsApp | [atendimento/agente-ia-whatsapp.md](atendimento/agente-ia-whatsapp.md) | revisado (código) |
| Automações do funil | [atendimento/automacoes-funil.md](atendimento/automacoes-funil.md) | revisado (código) |

### Configuração

| Fluxo | Arquivo | Status |
|---|---|---|
| Onboarding da academia | [config/onboarding-academia.md](config/onboarding-academia.md) | revisado (código) |
| Conta e assinatura do Nave | [config/conta-assinatura.md](config/conta-assinatura.md) | revisado (código) |
| Equipe — colaboradores | [config/equipe-colaboradores.md](config/equipe-colaboradores.md) | revisado (código) |

## Criar um novo fluxo

1. Copie [`_template.md`](_template.md).
2. Salve em `docs/flows/<modulo>/<nome-kebab>.md`.
3. Preencha metadados, mapa de telas, seções A e B.
4. Adicione uma linha neste índice.
5. Rotas canônicas: [`src/lib/naviMenu.js`](../../src/lib/naviMenu.js) e [`src/App.jsx`](../../src/App.jsx).

## Fontes de verdade no código

- **Labels de menu:** `src/lib/naviMenu.js`
- **Rotas:** `src/App.jsx`
- **Aliases legados** (`/caixa`, `/mensalidades`, `/alunos` → `/students`): documentar só em nota de rodapé, não como caminho principal.
