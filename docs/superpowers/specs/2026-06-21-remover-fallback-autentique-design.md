# Remover fallback global do Autentique nos contratos

**Data:** 2026-06-21  
**Status:** rascunho - aguardando aprovacao  
**Origem:** conversa de produto sobre impedir que contratos de multiplas academias usem uma conta padrao da plataforma no Autentique.

**Fluxos relacionados:**

- [contracts-autentique.md](../../contracts-autentique.md)
- [docs/data-model.md](../../data-model.md)

**Arquivos-chave hoje:**

- `lib/autentique/autentiqueService.ts`
- `lib/server/autentiqueHandlers.js`
- `src/components/academy/ContractsAutentiqueSection.jsx`
- `lib/contracts/contractHttp.ts`
- `lib/signContract.ts`

---

## 1. Resumo executivo

Hoje a integracao de contratos com Autentique aceita dois modos de credencial:

- token salvo na configuracao da propria academia
- fallback para `AUTENTIQUE_TOKEN` ou `AUTENTIQUE_API_TOKEN` no ambiente

Essa segunda via resolve setup incompleto, mas cria um comportamento multi-tenant perigoso: contratos de academias sem configuracao propria passam a ser criados, assinados, sincronizados ou cancelados usando a conta padrao da plataforma.

**Direcao desta spec:** remover o fallback global do runtime de contratos e exigir token proprio por academia para qualquer operacao que fale com a API do Autentique.

---

## 2. Problema

### 2.1 Mistura de tenants na mesma conta Autentique

Quando o backend usa o token global do ambiente:

- o documento nasce sob a conta da plataforma
- autoria, branding e trilha operacional deixam de refletir a academia real
- uma falha ou revogacao da credencial global impacta varias academias ao mesmo tempo

### 2.2 Regra de produto pouco clara

A UI atual informa que, sem configuracao, os contratos usam a conta padrao da plataforma. Isso normaliza um fallback que deveria ser excecao operacional, nao comportamento do produto.

### 2.3 Risco juridico e de suporte

Contratos e assinaturas digitais exigem isolamento forte por academia. Manter um fallback invisivel dificulta:

- explicar quem enviou o documento
- auditar problemas de assinatura
- separar responsabilidades entre Nave e academia

---

## 3. Objetivo

### Goals

| ID | Meta |
|---|---|
| G1 | Toda chamada a API Autentique em contratos usa apenas credencial da propria academia |
| G2 | Academia sem token proprio consegue preparar contratos, mas nao enviar para assinatura |
| G3 | Erros e CTAs deixam claro que falta conectar a conta Autentique da academia |
| G4 | Academias ja configuradas nao sofrem mudanca de fluxo |
| G5 | Logs distinguem "nao configurado" de falha real da API Autentique |

### Non-goals

| Item | Fora de escopo nesta spec |
|---|---|
| N1 | Migrar a integracao de contratos para outro provedor |
| N2 | Implementar OAuth/Connect do Autentique para terceiros |
| N3 | Criar onboarding novo completo de contratos |
| N4 | Bloquear edicao de modelos, preview PDF ou configuracao da aba Contratos sem token |
| N5 | Criar nova Serverless Function em `/api/` |

---

## 4. Decisao de produto

### 4.1 Regra principal

Operacoes de contratos que dependem da API Autentique so podem acontecer quando a academia tem token proprio configurado.

### 4.2 Capacidades sem token proprio

Sem token proprio, a academia ainda pode:

- acessar Integracoes > Autentique
- salvar token e e-mail da propria conta
- acessar Empresa > Contratos
- criar e editar modelos de contrato
- gerar pre-visualizacao PDF local

Sem token proprio, a academia nao pode:

- enviar contrato para assinatura
- auto-assinar usando conta da academia
- sincronizar contrato com dados do Autentique
- cancelar/remover documento no Autentique

### 4.3 Rollout aprovado

**Bloqueio imediato.**

Nao havera fase de warning com fallback ainda ativo. Assim que a implementacao entrar, academias sem token proprio passam a receber erro de negocio e CTA de configuracao ao tentar usar operacoes autenticadas do Autentique.

---

## 5. Estado atual

### 5.1 Backend

Hoje `getApiToken()` em `lib/autentique/autentiqueService.ts`:

1. tenta ler token salvo na academia
2. tenta token legado local da academia
3. se nao encontrar, cai em `AUTENTIQUE_TOKEN` ou `AUTENTIQUE_API_TOKEN`

Esse passo 3 e o fallback que deve ser removido do runtime de contratos.

### 5.2 Frontend

Hoje `ContractsAutentiqueSection` comunica que, sem configuracao, os contratos usam a conta padrao da plataforma. A copy passa a ficar errada apos a mudanca e precisa ser reescrita para:

- explicar que o envio fica bloqueado
- orientar a conectar a propria conta
- preservar a ideia de que webhook e configuracao continuam sendo feitos na mesma tela

### 5.3 Documentacao

`docs/contracts-autentique.md` ainda descreve `AUTENTIQUE_TOKEN` como variavel operacional principal. A doc precisa separar:

- credencial global de ambiente, se ainda existir para utilitarios internos
- regra de produto no runtime multi-tenant, que passa a exigir token por academia

---

## 6. Design

### 6.1 Fonte de verdade da credencial

Para contratos, a fonte de verdade passa a ser exclusivamente a configuracao da academia:

- `academy.settings.autentique.token_encrypted`
- legado da propria academia, enquanto houver suporte de leitura

O ambiente nao e mais usado como fallback para operacao de produto.

### 6.2 Erro de negocio explicito

Quando nao houver token da academia, o backend deve responder com um erro de negocio claro, estavel e rastreavel, por exemplo:

- `autentique_not_configured_for_academy`

Esse erro deve ser diferente de:

- timeout
- token invalido
- erro GraphQL do Autentique
- permissao negada

Assim a UI consegue orientar corretamente o usuario sem mascarar falha de infra como erro de setup.

### 6.3 Guard centralizado no backend

A validacao deve acontecer antes de qualquer chamada remota ao Autentique, de preferencia em um ponto central reaproveitado por:

- envio de contrato
- assinatura automatica da academia
- sync manual
- cancelamento/remocao

Objetivo: nao espalhar `if` duplicado em varios handlers.

### 6.4 UX de bloqueio

Na UI, academias sem token proprio devem ver:

- status `Nao configurado`
- copy explicando que e preciso conectar a conta para enviar contratos
- erros de acao com CTA ou orientacao para `Integracoes > Autentique`

O sistema nao deve prometer fallback invisivel.

### 6.5 Compatibilidade com contratos existentes

Contratos ja criados antes da mudanca podem continuar existindo no banco, mas operacoes futuras que exigem autenticar na conta emissora passam a depender da academia ter token valido.

Se existir contrato antigo criado com a conta global e a academia ainda nao configurar token proprio, a expectativa de produto e:

- visualizacao local do registro continua
- sync/cancelamento no Autentique pode ser bloqueado por falta de configuracao atual

Essa restricao e aceitavel porque o objetivo principal e corrigir a regra multi-tenant daqui para frente, sem manter dependencia invisivel de credencial global.

---

## 7. Requisitos

### P0 - Must ship

#### R1 - Remover fallback global do runtime

**Aceite:**

- [ ] `lib/autentique/autentiqueService.ts` nao usa mais `AUTENTIQUE_TOKEN` nem `AUTENTIQUE_API_TOKEN` como fallback para contratos
- [ ] Sem token da academia, a resolucao de credencial falha com erro de negocio explicito
- [ ] Academias com token salvo continuam enviando normalmente

#### R2 - Bloquear operacoes autenticadas do Autentique sem token proprio

**Aceite:**

- [ ] `POST /api/contracts` para envio falha de forma clara quando a academia nao tem token
- [ ] auto-assinatura da academia nao roda sem token proprio
- [ ] `GET /api/contracts?id={id}&sync=1` nao consulta Autentique sem token proprio
- [ ] `PATCH /api/contracts?id={id}` com cancelamento nao chama Autentique sem token proprio

#### R3 - UX e copy de Integracoes

**Aceite:**

- [ ] remover a mensagem que promete uso da conta padrao da plataforma
- [ ] exibir copy clara: sem configuracao, a academia nao envia contratos digitais
- [ ] manter o formulario de token/e-mail acessivel para resolver o bloqueio

#### R4 - Mapeamento de erro no frontend

**Aceite:**

- [ ] erro de nao configurado vira mensagem amigavel
- [ ] a mensagem orienta o usuario a conectar a propria conta Autentique
- [ ] a UX nao trata esse caso como erro generico de servidor

#### R5 - Observabilidade

**Aceite:**

- [ ] logs distinguem tentativa bloqueada por falta de configuracao
- [ ] falhas reais da API Autentique continuam logadas separadamente

#### R6 - Documentacao

**Aceite:**

- [ ] atualizar `docs/contracts-autentique.md` com a nova regra
- [ ] remover ou requalificar trechos que falam em conta padrao da plataforma

---

### P1 - Should ship no mesmo esforco se simples

#### R7 - Endpoint/status de Integracoes coerente

**Aceite:**

- [ ] `autentiqueGetStatusHandler` continua retornando `configured=false` sem depender de env global
- [ ] tela de Integracoes reflete apenas a configuracao da academia atual

#### R8 - Texto de ajuda para operacao

**Aceite:**

- [ ] explicar que a conta Autentique usada nos contratos e a da propria academia
- [ ] reforcar que criador do documento e auto-assinatura dependem dessa conta

---

## 8. Fluxos

### 8.1 Academia configurada

1. Owner salva token e e-mail em Integracoes
2. Backend persiste token criptografado em `academy.settings`
3. Envio de contrato resolve credencial da academia
4. Documento e criado normalmente no Autentique

### 8.2 Academia sem token proprio

1. Usuario tenta enviar contrato
2. Backend detecta ausencia de credencial da academia antes da chamada externa
3. API retorna erro de negocio de nao configurado
4. Frontend mostra mensagem orientando a configurar Integracoes > Autentique
5. Nenhuma chamada ao Autentique e realizada

### 8.3 Contrato antigo sem token atual

1. Usuario abre contrato ja existente
2. Dados locais continuam visiveis
3. Usuario tenta sincronizar ou cancelar
4. Backend bloqueia por falta de token atual da academia
5. UI informa que e preciso conectar a conta da academia para usar operacoes do Autentique

---

## 9. Riscos e mitigacoes

| Risco | Impacto | Mitigacao |
|---|---|---|
| Academia usava contratos sem perceber que dependia da conta global | Falha imediata ao enviar apos deploy | Copy clara em Integracoes e erro amigavel no envio |
| Contratos antigos criados pela conta global perdem capacidade de sync/cancel sem token atual | Suporte pontual | Documentar comportamento e orientar conexao da conta da academia |
| Erro de negocio se mistura com erro tecnico | UX confusa | Codigo de erro dedicado e tratamento especifico no frontend |
| Validacoes espalhadas | Regressao futura | Centralizar resolucao da credencial/guard no backend |

---

## 10. Testes

Adicionar ou ajustar cobertura para:

- resolucao de token com academia configurada
- ausencia de token da academia retornando erro explicito
- garantia de que variaveis `AUTENTIQUE_TOKEN` e `AUTENTIQUE_API_TOKEN` nao sao usadas como fallback no runtime de contratos
- envio de contrato bloqueado sem configuracao
- copy/status da tela de Integracoes sem mencionar conta padrao da plataforma

Tambem validar manualmente:

- academia com token proprio continua enviando
- academia sem token consegue editar modelos e gerar preview
- academia sem token nao consegue enviar, sincronizar ou cancelar

---

## 11. Resultado esperado

Depois da entrega:

- contratos deixam de depender da conta padrao da plataforma
- a regra multi-tenant fica consistente com isolamento por academia
- o produto comunica com clareza que a assinatura digital pertence a conta Autentique da propria academia
- falhas de setup deixam de ser mascaradas por fallback invisivel
