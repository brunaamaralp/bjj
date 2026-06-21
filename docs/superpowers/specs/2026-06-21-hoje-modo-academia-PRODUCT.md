# Hoje — Modo Academia (Crescimento / Consolidação)

**Data:** 2026-06-21  
**Status:** rascunho — aguardando aprovação  
**Autor:** conversa produto 2026-06-21  
**TECH:** a escrever  

**Fluxos relacionados:**
- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)

**Specs relacionadas:**
- [2026-06-17-retencao-frequencia-ux-evolucao-PRODUCT.md](./2026-06-17-retencao-frequencia-ux-evolucao-PRODUCT.md) — módulo de retenção por frequência (base de dados de ausência já implementada)
- [2026-06-15-cobranca-inadimplencia-PRODUCT.md](./2026-06-15-cobranca-inadimplencia-PRODUCT.md) — tela de inadimplência já existente

---

## 1. Problema

A página "Hoje" (Recepção / `/`) foi desenhada para academias em fase de crescimento — onde o foco operacional diário é converter leads em alunos via aulas experimentais. Essa escolha é correta para a maioria das academias novas ou em expansão.

Porém, academias consolidadas (base de alunos estável, poucos experimentais por semana) abrem a página e encontram seções vazias ou pouco relevantes. O resultado é que **a tela principal do sistema perde utilidade justamente para as academias mais maduras** — que deveriam ser as mais engajadas com a plataforma.

As necessidades operacionais diárias mudam conforme o estágio:

| Fase crescimento | Fase consolidação |
|---|---|
| Quem tem experimental hoje? | Quem faltou nos últimos dias? |
| Quem precisa de follow-up? | Quem tem mensalidade vencendo? |
| Quantas matrículas no mês? | Quem completa 1 ano essa semana? |
| Aniversariantes (secundário) | Aniversariantes (principal) |

Não existe hoje forma de adaptar a tela a esse contexto diferente.

---

## 2. Proposta

Adicionar um **chip de modo** na página Hoje que alterna entre dois conjuntos de blocos de informação:

```
┌─────────────────────────────────────────────────────┐
│  🌱 Crescimento        🏛️ Consolidação              │  ← chip no topo
└─────────────────────────────────────────────────────┘
```

O modo é **persistido por academia** (localStorage) e **não exige configuração em outra tela** — o gestor troca ali mesmo quando sentir que mudou de fase.

---

## 3. Goals

1. **Utilidade diária para academias consolidadas** — gestor de academia com 80+ alunos abre a tela e encontra ações relevantes sem precisar navegar para outras páginas.
2. **Zero fricção para academias em crescimento** — o modo padrão é "Crescimento"; academias novas não percebem mudança.
3. **Uma superfície, dois perfis operacionais** — gestor e recepcionista usam a mesma tela em ambos os modos (não há separação de papéis na tela, apenas de contexto).
4. **Reutilização de dados já existentes** — os blocos de consolidação consomem dados já disponíveis no sistema (retenção, `student_payments`, `enrollmentDate`) sem nova infraestrutura de banco.

---

## 4. Non-Goals

- **Não é personalização granular** — o usuário não configura quais blocos aparecem; apenas escolhe um dos dois modos predefinidos. Isso evita complexidade de UI desnecessária nesta versão.
- **Não é detecção automática de fase** — o sistema não tenta inferir em qual modo a academia está com base em métricas. O gestor decide conscientemente. (Pode ser adicionado em v2.)
- **Não cria nova página** — a separação em "Hoje" vs "Recepção" como páginas distintas fica fora do escopo desta feature. O chip resolve o problema sem multiplicar rotas.
- **Não substitui relatórios** — os blocos da fase de consolidação mostram highlights operacionais do dia/semana, não substituem os relatórios de retenção ou financeiro já existentes.
- **Não afeta a aba Catraca** — a aba de controle de acesso (ControlID) não muda em nenhum dos modos.

---

## 5. User Stories

### Modo Crescimento (comportamento atual, preservado)

- Como gestor de academia em fase de crescimento, quero ver quais experimentais estão agendados para hoje e quem precisa de follow-up, para executar meu processo de conversão sem precisar ir a outras telas.
- Como recepcionista, quero marcar comparecimento de experimentais diretamente na tela principal, para não precisar abrir o perfil do lead para cada marcação.

### Modo Consolidação (novo)

- Como gestor de academia consolidada, quero ver quais alunos estão com presença irregular nos últimos dias, para entrar em contato antes que abandonem.
- Como gestor, quero ver quais mensalidades vencem ou estão atrasadas esta semana, para agir no momento certo sem precisar abrir o módulo financeiro todo dia.
- Como gestor, quero ver quais alunos fazem aniversário hoje e quais completam 1 ano de matrícula esta semana, para fazer contato de relacionamento sem precisar pesquisar manualmente.
- Como gestor, quero alternar entre os modos sem sair da tela, para que a mudança seja imediata e sem fricção.
- Como gestor, quero que o modo escolhido seja lembrado ao reabrir o sistema, para não precisar reconfigurar toda vez.

### Edge cases

- Como gestor no modo Consolidação que recebe uma agenda de experimentais, quero que os experimentais do dia ainda apareçam (como bloco secundário), para não perder o operacional de conversão mesmo numa fase estável.
- Como gestor no modo Crescimento sem experimentais agendados para hoje, quero ver um estado vazio claro com CTA para agendar, não uma tela em branco sem direção.

---

## 6. Requisitos

### P0 — Must Have

**Chip de modo**
- [ ] Chip com duas opções: "Crescimento" e "Consolidação", visível no topo da página Hoje (abaixo do header, acima dos blocos)
- [ ] Modo padrão: "Crescimento" (sem impacto em academias existentes no primeiro acesso)
- [ ] Modo persistido em `localStorage` com chave `hoje_modo_{academyId}` (por academia, não global)
- [ ] Troca de modo imediata, sem reload de página

**Blocos — Modo Consolidação**

*Bloco 1: Alunos em risco de abandono*
- [ ] Lista de alunos classificados como "em risco" ou "crítico" pelo módulo de retenção por frequência (`lib/attendanceRetentionCore.js`)
- [ ] Informação mínima por aluno: nome, dias desde última presença, status de risco
- [ ] Ação rápida: abrir WhatsApp ou perfil do aluno
- [ ] Empty state: "Todos os alunos com presença regular" quando lista vazia
- [ ] Link "Ver todos no relatório" → `/reports?tab=frequencia`
- [ ] Bloco só aparece se o módulo de frequência estiver configurado (catraca ou registro manual)

*Bloco 2: Financeiro da semana*
- [ ] Mensalidades com vencimento nos próximos 7 dias (status `pending` ou `awaiting`)
- [ ] Mensalidades em atraso (vencidas, status não `paid`)
- [ ] Informação mínima: nome do aluno, valor, dias de atraso (se atrasado) ou dias até vencer
- [ ] Máximo 10 itens por subseção; link "Ver todos" → tela de inadimplência já existente
- [ ] Empty state: "Sem mensalidades vencendo esta semana"

*Bloco 3: Relacionamento*
- [ ] Aniversariantes do dia (já existe como banner — deve ser promovido como bloco primário no modo consolidação)
- [ ] Alunos que completam 1 ano de matrícula nos próximos 7 dias (baseado em `enrollmentDate`)
- [ ] Para cada um: nome, foto/avatar se disponível, botão WhatsApp
- [ ] Empty state por seção quando não há nenhum

*Experimentais do dia (secundário no modo consolidação)*
- [ ] Se houver experimentais agendados para hoje, aparecem como bloco compacto abaixo dos blocos primários
- [ ] Mesma funcionalidade de marcação de presença do modo crescimento
- [ ] Se não houver experimentais hoje, o bloco não aparece

### P1 — Nice to Have

- [ ] KPIs compactos no modo consolidação: total de alunos ativos, saídas no mês, taxa de presença da semana — como linha de métricas abaixo do chip, não cards grandes
- [ ] Animação de transição suave ao trocar de modo (fade dos blocos)
- [ ] Indicador visual no chip de que há itens pendentes em cada modo (ex: badge numérico no chip "Crescimento" quando há follow-ups críticos)
- [ ] Tooltip no chip explicando o que cada modo significa, para novos usuários

### P2 — Future Considerations

- [ ] Detecção automática de fase sugerida: "Você tem poucos experimentais este mês. Quer experimentar o modo Consolidação?" (requer definição de thresholds)
- [ ] Terceiro modo "Equilibrado" com seleção de blocos de ambas as fases
- [ ] Configuração de quais blocos aparecem em cada modo (personalização granular)
- [ ] Modo "Recepção" focado em presença física (para tablet na mesa de entrada)

---

## 7. Design — Wireframe ASCII

```
┌──────────────────────────────────────────────────────────────────┐
│ Recepção                              [+ Novo lead]  [↻]         │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [ 🌱 Crescimento ]  [ 🏛️ Consolidação ]     ← chip, tab-style   │
│                                                                    │
│  ── MODO CONSOLIDAÇÃO ──────────────────────────────────────────  │
│                                                                    │
│  ⚠️  Alunos em risco          Ver relatório →                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ João Silva          Crítico    12 dias sem aparecer  [WA]  │   │
│  │ Maria Costa         Esfriando   7 dias sem aparecer  [WA]  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  💰  Financeiro da semana     Ver inadimplência →                 │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Pedro Alves         Vence em 2 dias    R$ 150       [WA]  │   │
│  │ Ana Lima            Atrasado 5 dias    R$ 150       [WA]  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  🎂  Relacionamento                                               │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Carlos Souza        Aniversário hoje              [WA] 🎂  │   │
│  │ Bruna Ferreira      1 ano de matrícula em 3 dias  [WA] 🏆  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ── Hoje: 1 experimental ───────────────────────────────────── ↓  │
│  (bloco compacto, secundário)                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Métricas de Sucesso

**Leading (1–4 semanas pós-lançamento):**
- % de academias com 60+ alunos que trocam para modo Consolidação pelo menos uma vez
- Taxa de uso diário da tela Hoje em academias consolidadas (sessões/dia com `hubTab = experimentais`)

**Lagging (1–3 meses pós-lançamento):**
- Redução de churn de alunos em academias que usam modo Consolidação (proxy: menos saídas registradas no mês)
- Aumento de inadimplência recuperada em academias que usam o bloco financeiro

---

## 9. Questões em Aberto

| # | Questão | Quem responde | Blocking? |
|---|---------|---------------|-----------|
| 1 | O módulo de frequência já cobre academias sem catraca (registro manual) suficientemente para que o bloco de risco de abandono seja útil? | Produto + dados reais GBLP | Sim — define se o bloco P0 é viável no lançamento |
| 2 | Qual threshold de "vencendo" faz mais sentido para o bloco financeiro — 7 dias ou 3 dias? | Produto (conversa com gestores) | Não |
| 3 | O `enrollmentDate` está preenchido de forma consistente nas academias existentes para calcular aniversário de 1 ano? | Engenharia | Sim — se não, o bloco de relacionamento precisa de fallback |
| 4 | O chip deve aparecer para todas as academias ou só para academias com módulo de frequência + módulo financeiro ativos? | Produto | Não — pode lançar para todos com degradação graciosa |

---

## 10. Fases de Implementação Sugeridas

### Fase 1 — MVP (Ship it)
- Chip de modo com persistência em localStorage
- Modo Consolidação com os 3 blocos P0 (risco, financeiro, relacionamento)
- Experimentais como bloco secundário no modo consolidação
- Degradação graciosa: se módulo de frequência não configurado, bloco de risco mostra empty state orientativo

### Fase 2 — Polish
- KPIs compactos (P1)
- Badge numérico no chip (P1)
- Transição animada (P1)

### Fase 3 — Inteligência
- Sugestão automática de troca de modo (P2)
- Personalização de blocos (P2)
