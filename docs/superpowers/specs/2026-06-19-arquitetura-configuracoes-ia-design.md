# Arquitetura da informacao das configuracoes

**Data:** 2026-06-19  
**Status:** rascunho - aguardando aprovacao  
**Origem:** conversa de produto sobre reorganizar a divisao entre `Configuracoes`, `Mensagens automaticas`, `Agente IA`, `Integracoes` e `Minha conta` usando como criterio principal `tema do negocio` + `frequencia de uso`.

**Fluxos relacionados:**

- [onboarding-academia.md](../../flows/config/onboarding-academia.md)
- [conta-assinatura.md](../../flows/config/conta-assinatura.md)
- [agente-ia-whatsapp.md](../../flows/atendimento/agente-ia-whatsapp.md)
- [automacoes-funil.md](../../flows/atendimento/automacoes-funil.md)
- [conversas-inbox.md](../../flows/crm/conversas-inbox.md)

**Arquivos-chave hoje:**

- `src/App.jsx`
- `src/lib/naviMenu.js`
- `src/pages/AcademySettings.jsx`
- `src/pages/UserAccount.jsx`
- `src/pages/Integracoes.jsx`
- `src/pages/AIAgentSettings.jsx`
- `src/pages/Automacoes.jsx`

---

## 1. Resumo executivo

O produto hoje distribui configuracoes da academia em varios hubs diferentes:

- `Minha conta` - conta do usuario + assinatura + avancado
- `Empresa` - estrutura da academia, CRM, alunos e horarios
- `Integracoes` - canais e sistemas externos
- `Agente IA` - comportamento do assistente no WhatsApp
- `Mensagens automaticas` - textos, gatilhos e modos de envio

Essa distribuicao cresceu de forma pragmatica, mas hoje gera uma leitura confusa de "o que e configuracao", "o que e operacao" e "onde moro o WhatsApp".

**Direcao aprovada nesta spec:** tratar a arquitetura de informacao em tres camadas:

1. `Minha conta` - tudo que pertence ao usuario
2. `Configuracoes` - tudo que define estrutura, defaults e regras-base da academia
3. `Operacao` - tudo que a equipe usa para operar o dia a dia

---

## 2. Problema

### 2.1 Fragmentacao atual

Hoje o usuario precisa navegar entre varios lugares para configurar o mesmo dominio operacional.

O exemplo mais forte e `WhatsApp`, que esta quebrado em:

- `Integracoes > WhatsApp` - conexao do canal
- `Agente IA` - comportamento do assistente
- `Mensagens automaticas` - campanhas, textos, gatilhos e modos de envio
- `Conversas` - superficie operacional onde a equipe acompanha o canal

Isso nao e necessariamente errado do ponto de vista tecnico, mas a IA atual nao explicita a diferenca entre `canal`, `inteligencia`, `automacao` e `operacao`.

### 2.2 Super hub amplo demais

`Empresa` acumulou configuracoes de natureza muito diferente:

- dados institucionais
- configuracao de CRM
- configuracao de alunos
- configuracao de turmas e horarios

Na pratica, ele virou um "lugar de tudo o que nao ganhou pagina propria".

### 2.3 Mistura de setup e operacao

O produto hoje aproxima demais:

- ajuste estrutural raro
- rotina operacional frequente

Exemplo:

- `Planos`, `dados fiscais` e `etapas do funil` sao setup estrutural
- `Agente IA`, `Mensagens automaticas` e `Conversas` sao operacao recorrente

Quando essas naturezas ficam muito proximas, a navegacao perde previsibilidade.

---

## 3. Objetivo da reorganizacao

### Goals

| ID | Meta |
|---|---|
| G1 | Tornar claro o que e `conta pessoal`, o que e `configuracao da academia` e o que e `operacao` |
| G2 | Organizar configuracoes por `tema do negocio`, nao por historico de implementacao |
| G3 | Priorizar descobribilidade das configuracoes frequentes sem esconder superfices operacionais |
| G4 | Reduzir a sensacao de duplicidade entre `Integracoes`, `Agente IA` e `Mensagens automaticas` |
| G5 | Criar uma regra de classificacao consistente para features futuras |
| G6 | Permitir evolucao da navegacao sem transformar `Configuracoes` em uma pagina gigante |

### Non-goals

| Item | Fora de escopo nesta spec |
|---|---|
| N1 | Redesenhar todos os componentes internos de cada pagina |
| N2 | Mudar o modelo de dados de academias, automacoes, IA ou integracoes |
| N3 | Fundir tecnicamente `Agente IA` e `Mensagens automaticas` numa mesma pagina |
| N4 | Criar uma home operacional unica para todo o produto |
| N5 | Rever taxonomia completa da sidebar alem das areas afetadas por configuracoes |

---

## 4. Principio de classificacao

### 4.1 Regra principal

Toda configuracao nova deve responder primeiro a pergunta:

> "Isso altera a conta do usuario, a estrutura da academia ou a operacao diaria?"

### 4.2 Regra por camada

| Camada | Pergunta-chave | Exemplos |
|---|---|---|
| `Minha conta` | Isso pertence ao usuario logado? | senha, perfil, preferencias pessoais, assinatura do Nave |
| `Configuracoes` | Isso define como a academia funciona por padrao? | funil, etiquetas, horarios, integracoes, planos, regras-base |
| `Operacao` | Isso e usado pela equipe no dia a dia para executar trabalho? | inbox, agente IA, mensagens automaticas, financeiro operacional, tarefas |

### 4.3 Regra secundaria: frequencia de uso

Mesmo dentro do mesmo tema, a frequencia de uso orienta a IA:

- `Alta frequencia` - deve ficar em superficies operacionais ou de acesso direto
- `Baixa frequencia` - deve ficar dentro de configuracoes estruturais

**Exemplo:** WhatsApp conectado e configurado uma vez fica em `Configuracoes > Integracoes`; responder clientes, configurar assistente e revisar automacoes fica em hubs operacionais.

---

## 5. Inventario atual e reflexos no produto

### 5.1 Minha conta

| Area atual | Conteudo | Onde reflete |
|---|---|---|
| `Perfil` | nome, e-mail, senha | autenticacao e dados do usuario |
| `Assinatura` | plano e faturamento do Nave | acesso comercial por academia |
| `Avancado` | checklist e acoes irreversiveis | mistura conta pessoal com acoes de workspace |

### 5.2 Empresa

| Area atual | Conteudo | Onde reflete |
|---|---|---|
| `Estudio` | dados gerais, endereco, redes, personalizacao | identidade da academia, dados publicos, labels e comunicacoes |
| `Funil` | etapas, perguntas, etiquetas, metas | pipeline, perfil do lead, relatorios |
| `Alunos` | campos, graduacoes, matricula | perfil do aluno, cadastro, matricula online |
| `Horarios` | turmas e horarios | aulas, presenca, recepcao e agenda |

### 5.3 Integracoes

| Area atual | Conteudo | Onde reflete |
|---|---|---|
| `WhatsApp` | conexao do canal | inbox, automacoes, agente IA |
| `Catraca` | Control iD | recepcao e acesso |
| `Autentique` | assinatura digital | contratos |

### 5.4 Hubs operacionais atuais

| Hub atual | Conteudo | Onde reflete |
|---|---|---|
| `Agente IA` | prompt, ativacao, teste, status do assistente | atendimento automatico no WhatsApp |
| `Mensagens automaticas` | textos, gatilhos, modos, audiencia | comunicacao automatica do funil e de rotinas |
| `Conversas` | inbox do canal | atendimento humano e handoff |

### 5.5 Conclusao do inventario

O produto ja tem uma separacao tecnica parcial entre `setup` e `operacao`, mas a nomenclatura e a navegacao ainda nao deixam isso claro.

---

## 6. Arquitetura alvo

### 6.1 Macroestrutura

```
Minha conta
Configuracoes
Operacao
```

### 6.2 Minha conta

Escopo: tudo que pertence ao usuario logado.

```
Minha conta
  Perfil
  Assinatura
  Preferencias
```

**Regra:** nada aqui deve alterar o funcionamento global da academia, exceto itens explicitamente comerciais da conta.

### 6.3 Configuracoes

Escopo: estrutura, defaults, parametros e conexoes da academia.

```
Configuracoes
  Academia
    Dados gerais
    Endereco
    Redes sociais
    Personalizacao

  CRM
    Etapas do funil
    Perguntas
    Etiquetas
    Metas

  Alunos e aulas
    Campos e motivos
    Graduacoes
    Matricula
    Turmas
    Horarios

  Integracoes
    WhatsApp
    Catraca
    Autentique

  Financeiro - setup
    Planos
    Regras de cobranca
    Parametros financeiros

  Atendimento - base
    Canais conectados
    Permissoes
    Regras globais
```

### 6.4 Operacao

Escopo: superficies que a equipe usa no dia a dia.

```
Operacao
  Conversas
  Agente IA
  Mensagens automaticas
  Financeiro
  Tarefas
```

---

## 7. Decisoes de produto aprovadas

### 7.1 `Mensagens automaticas` fica fora de `Configuracoes`

**Decisao:** manter `Mensagens automaticas` como hub operacional.

**Justificativa:**

- uso recorrente
- impacto direto na rotina
- necessidade de revisar, ativar e ajustar continuamente
- nao e apenas setup administrativo

### 7.2 `Agente IA` tambem fica fora de `Configuracoes`

**Decisao:** manter `Agente IA` como hub operacional proprio.

**Justificativa:**

- a equipe pensa em "como o assistente atende" como operacao do canal
- envolve teste, ativacao, status e supervisao
- nao deve ficar escondido dentro de configuracoes da academia

### 7.3 `Empresa` deixa de ser o nome guarda-chuva

**Decisao:** substituir a leitura atual de `Empresa` por uma estrutura explicita de `Configuracoes`.

**Justificativa:**

- "Empresa" e amplo e pouco orientado a tarefa
- "Configuracoes" descreve melhor a funcao da area
- as subareas ficam mais autoexplicativas

### 7.4 `Alunos` e `Horarios` passam a formar uma mesma familia

**Decisao:** reagrupar `Alunos` e `Horarios` em `Configuracoes > Alunos e aulas`.

**Justificativa:**

- o usuario pensa em turmas, matricula, horarios e graduacoes como partes de uma mesma familia operacional
- reduz dispersao entre dados do aluno e estrutura das aulas

---

## 8. Mapa de migracao do estado atual para o estado alvo

| Estado atual | Estado alvo | Observacao |
|---|---|---|
| `Minha conta > Perfil` | `Minha conta > Perfil` | mantem |
| `Minha conta > Assinatura` | `Minha conta > Assinatura` | mantem |
| `Minha conta > Avancado` | revisar item a item | o que for da academia sai de `Minha conta` |
| `Empresa > Estudio` | `Configuracoes > Academia` | renomeacao conceitual |
| `Empresa > Funil` | `Configuracoes > CRM` | reclassificacao por dominio |
| `Empresa > Alunos` | `Configuracoes > Alunos e aulas` | unifica com horarios |
| `Empresa > Horarios` | `Configuracoes > Alunos e aulas` | unifica com alunos |
| `Integracoes` | `Configuracoes > Integracoes` | mantem dominio, muda camada |
| `Agente IA` | `Operacao > Agente IA` | mantem separado |
| `Mensagens automaticas` | `Operacao > Mensagens automaticas` | mantem separado |

---

## 9. Regra especifica para WhatsApp

Para reduzir a confusao atual, o tema `WhatsApp` deve ser tratado em tres camadas distintas.

| Camada | Pergunta do usuario | Local |
|---|---|---|
| `Canal` | O numero esta conectado? | `Configuracoes > Integracoes > WhatsApp` |
| `Inteligencia` | Como o assistente atende? | `Operacao > Agente IA` |
| `Automacao` | Quais mensagens o sistema envia sozinho? | `Operacao > Mensagens automaticas` |
| `Atendimento` | O que chegou e quem responde? | `Operacao > Conversas` |

**Invariante de copy:** a navegacao e os headers devem explicitar a diferenca entre `conectar o canal`, `configurar o assistente` e `configurar automacoes`.

---

## 10. Criterios de classificacao para features futuras

### Vai para `Minha conta` quando

- pertence ao usuario logado
- nao depende da academia ativa para fazer sentido
- altera autenticacao, preferencias ou dados pessoais

### Vai para `Configuracoes` quando

- altera a estrutura-base da academia
- define defaults do sistema
- muda regras persistentes da operacao
- costuma ser configurado poucas vezes e revisado esporadicamente

### Vai para `Operacao` quando

- a equipe volta ali com frequencia
- o objetivo principal e executar trabalho, nao parametrizar
- o usuario precisa monitorar status, revisar resultados ou agir rapidamente

### Exemplos normativos

| Exemplo | Destino |
|---|---|
| Conectar numero do WhatsApp | `Configuracoes > Integracoes > WhatsApp` |
| Editar prompt do assistente | `Operacao > Agente IA` |
| Ativar atendimento automatico | `Operacao > Agente IA` |
| Editar texto de aniversario | `Operacao > Mensagens automaticas` |
| Ajustar etapas do pipeline | `Configuracoes > CRM` |
| Ajustar planos e regras-base de cobranca | `Configuracoes > Financeiro - setup` |
| Cobrar pendencias e registrar recebimentos | `Operacao > Financeiro` |

---

## 11. Requisitos de navegacao

### R-01 - Camadas explicitas

A navegacao precisa tornar visivel a diferenca entre:

- `Minha conta`
- `Configuracoes`
- `Operacao`

### R-02 - `Configuracoes` nao pode virar uma pagina gigante

A implementacao deve usar uma home de configuracoes com grupos claros ou uma navegacao interna equivalente, sem empilhar todas as secoes num unico scroll.

### R-03 - Nomes orientados a dominio

Evitar nomes guarda-chuva vagos como `Empresa` quando a pagina abriga varios dominios distintos.

### R-04 - Continuidade por redirects

As rotas atuais devem continuar funcionando via redirects ou aliases durante a transicao:

- `/empresa`
- `/integracoes`
- `/agente-ia`
- `/automacoes`
- `/conta`

### R-05 - Atualizacao de documentacao de fluxo

Qualquer alteracao de rota, menu ou agrupamento visivel precisa atualizar os fluxos correspondentes em `docs/flows/` no mesmo PR.

---

## 12. Rollout sugerido

### Fase 1 - Clarificacao conceitual

- renomear `Empresa` para uma leitura mais explicita de `Configuracoes`
- criar grupos conceituais alvo
- revisar headers, copy e breadcrumbs

### Fase 2 - Reagrupamento interno

- mover `Estudio`, `Funil`, `Alunos` e `Horarios` para a nova IA
- consolidar `Alunos` + `Horarios` em `Alunos e aulas`
- mover `Integracoes` para dentro da camada de configuracoes

### Fase 3 - Navegacao lateral e aliases

- refletir nova IA em `src/lib/naviMenu.js`
- manter redirects e suportar habituacao gradual

---

## 13. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Usuario perder referencias antigas de `Empresa` | redirects + copy transitoria + labels claras |
| `Configuracoes` virar dumping ground de novo | aplicar regra de classificacao desta spec em toda feature nova |
| Confusao continua no tema WhatsApp | reforcar os 4 papeis: canal, inteligencia, automacao, atendimento |
| Excesso de niveis na navegacao | limitar profundidade e usar grupos estaveis |

---

## 14. Criterios de aceite da spec

1. A taxonomia final separa claramente `Minha conta`, `Configuracoes` e `Operacao`.
2. `Mensagens automaticas` permanece fora de `Configuracoes`.
3. `Agente IA` permanece fora de `Configuracoes`.
4. `Empresa` deixa de ser o guarda-chuva principal e e substituida por grupos orientados a dominio.
5. `Alunos` e `Horarios` passam a mesma familia de configuracao.
6. A regra de classificacao cobre features futuras sem depender do contexto historico da implementacao.
7. A camada `WhatsApp` fica explicitamente separada entre `Integracao`, `Inteligencia`, `Automacao` e `Atendimento`.

---

## 15. Open questions

| ID | Pergunta | Proposta atual |
|---|---|---|
| OQ-1 | `Configuracoes` sera uma nova home com cards ou apenas um hub tabulado? | decidir no plano/implementacao |
| OQ-2 | `Minha conta > Avancado` sera mantido como aba ou quebrado em itens menores? | revisar item a item |
| OQ-3 | `Financeiro - setup` entra no mesmo hub de configuracoes agora ou em etapa posterior? | manter previsto, validar escopo no plano |

---

## 16. Decisao final desta spec

**Aprovado como direcao de produto:**

- `Minha conta` para dados do usuario
- `Configuracoes` para estrutura, defaults e integracoes da academia
- `Operacao` para superficies de trabalho recorrente

**Decisoes-chave:**

- `Mensagens automaticas` continua fora de `Configuracoes`
- `Agente IA` continua fora de `Configuracoes`
- `Empresa` deve ser substituida por uma IA mais explicita
- `Alunos` e `Horarios` passam a compartilhar a mesma familia
- `WhatsApp` deve ser explicado como um tema distribuido em camadas, nao como um unico lugar
