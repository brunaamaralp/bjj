# Onboarding da academia

| Campo | Valor |
|---|---|
| **id** | `config.onboarding.academia` |
| **módulo** | Config |
| **personas** | owner, admin (IA/WhatsApp bloqueados para alguns members); recepcionista vê banner com restrições |
| **rotas** | Banner global; destinos por passo (`/new-lead`, `/configuracoes?tab=integracoes&section=whatsapp`, `/agente-ia?setup=1`, etc.) |
| **pré-requisitos** | Academia criada; usuário logado com `academyId` selecionado |
| **status** | revisado (código) |
| **última revisão** | 2026-06-18 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:** — (comportamento em `onboardingChecklist.js` + `OnboardingBanner.jsx`)

**Harness relacionado:** validação manual; testes adjacentes em `financeSettingsSections`, `financeConfigStorage`

**Arquivos-chave:** `src/components/OnboardingBanner.jsx`, `src/lib/onboardingChecklist.js`, `src/pages/AcademySettings.jsx` (passo fiscal)

---

## Resumo

Novas academias veem o banner **«Vamos deixar seu CRM pronto?»** com passos essenciais adaptados aos módulos ativos (financeiro, loja, billing). Alguns passos auto-concluem quando o sistema detecta dados (plano cadastrado, produto existente, estoque > 0). O usuário pode dispensar o banner por academia (`localStorage`).

---

## Diagrama de fluxo

```mermaid
flowchart TD
  login[Login + academia selecionada] --> banner[OnboardingBanner]
  banner --> core[buildEffectiveCoreSteps]
  core --> modules{Módulos ativos}
  modules --> steps[Lista de passos pendentes]
  steps --> click[Clicar passo ou Continuar]
  click --> nav[onboardingStepPath]
  nav --> dest[Destino da jornada]
  dest --> action[Usuário completa ação]
  action --> auto[Auto-done ou persist done]
  auto --> banner
  banner --> dismiss[Dispensar] --> hidden[Banner oculto]
```

---

## Mapa de telas

| # | Onde | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | Qualquer página autenticada | `OnboardingBanner` | Ver progresso N/M | Chips de passos pendentes |
| 2 | Banner | **Continuar** | Próximo passo acionável | `handleStepNav` → rota |
| 3 | Banner | **Ver todos os passos** | Expandir lista | Chips clicáveis por passo |
| 4 | Banner | **Dispensar** (X) | Ocultar checklist | `localStorage` por `academyId` |
| 5 | Passo `first_lead` | `/new-lead` | Criar lead | Passo marcado done (persist) |
| 6 | Passo `connect_whatsapp` | `/configuracoes?tab=integracoes&section=whatsapp` | Conectar WhatsApp | Integração Zapster |
| 7 | Passo `setup_ai` | `/agente-ia?setup=1` | Configurar assistente | Bloqueado até `connect_whatsapp` done |
| 8 | Passo `setup_finance` | `/configuracoes?tab=financeiro` | Cadastrar planos | Auto-done se `plans.length > 0` |
| 9 | Passo `first_product` | `/loja?tab=produtos` | Cadastrar produto | Auto-done se há produtos |
| 10 | Passo `first_stock_entry` | `/loja?tab=estoque` | Entrada de estoque | Auto-done se `current_quantity > 0` |
| 11 | Passo `company_tax` | `/configuracoes?tab=academia&focus=tax` | CPF/CNPJ | Quando billing live exige |
| 12 | Secundário `install_pwa` | Toast instrução | Marcar feito manual | `completeOnboardingStepIds` |

### Passos no núcleo (`buildEffectiveCoreSteps`)

| ID | Título | Quando entra | Destino canônico |
|---|---|---|---|
| `first_lead` | Criar primeiro lead | Sempre | `/new-lead` |
| `connect_whatsapp` | Conectar WhatsApp | Sempre | `/configuracoes?tab=integracoes&section=whatsapp` |
| `setup_ai` | Configurar IA | Sempre | `/agente-ia?setup=1` |
| `setup_finance` | Configurar financeiro | `modules.finance` | `/configuracoes?tab=financeiro` |
| `first_product` | Cadastrar produto | `sales` ou `inventory` | `/loja?tab=produtos` |
| `first_stock_entry` | Estoque inicial | `inventory` | `/loja?tab=estoque` |
| `company_tax` | CPF/CNPJ | Billing live + fiscal pendente | `/configuracoes?tab=academia&focus=tax` |

**Fora do núcleo do banner:** `setup_automations` (checklist persistido, não contado no progresso principal); `install_pwa` (secundário, chip separado).

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] `academyId` no store
- [ ] Documento academia com `onboardingChecklist` (JSON compacto no Appwrite)

### Permissões e restrições

| Papel | Ver banner | Passos IA/WhatsApp |
|---|---|---|
| **owner** | Sim | Clicáveis |
| **admin** | Sim | Clicáveis |
| **member** | Sim | Bloqueados — toast pede ao dono |

`stepBlocked`: `setup_ai` e `connect_whatsapp` quando `!canConfigureAgenteIa`; adicionalmente `setup_ai` quando `connect_whatsapp` ainda pendente (chip muted + toast «Conecte o WhatsApp em Integrações primeiro.»).

### Checklist passo a passo

1. [ ] Academia nova: banner aparece com progresso < total
2. [ ] Todos os passos core done → banner some (`allCoreDone`)
3. [ ] Dispensar → não reaparece até `onboardingChecklistReopenNonce` ou limpar `localStorage`
4. [ ] `setup_finance` auto-completa ao salvar primeiro plano (sem clicar no passo)
5. [ ] `first_product` auto-completa quando `products.length > 0`
6. [ ] `first_stock_entry` auto-completa quando algum item tem `current_quantity > 0`
7. [ ] Módulo finance off → passo `setup_finance` ausente do core
8. [ ] Só sales (sem inventory) → `first_product` sim; `first_stock_entry` não
9. [ ] Member: clicar IA/WhatsApp sem permissão → toast informativo, sem navegar
10. [ ] Owner: clicar `setup_ai` sem WA → toast + redirect Integrações
11. [ ] `company_tax` só com billing live e `companyTaxOk === false`
12. [ ] Trial ativo → linha «Trial: N dias» no banner expandido
13. [ ] Trocar academia → progresso e dismiss key isolados por `academyId`

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Member em passo IA | Toast «Peça ao dono…» | `OnboardingBanner.handleStepNav` |
| `setup_ai` sem WA | Toast + `/configuracoes?tab=integracoes&section=whatsapp` | Guard `connect_whatsapp` |
| PWA | Toast com instrução de instalar | `install_pwa` path `null` |

### Critérios de fluxo saudável vs regressão

**Saudável:** Passos condicionais corretos por módulo; auto-done evita clique falso; dismiss por academia.

**Regressão:** Banner com total errado; passo financeiro sem módulo; member configura WhatsApp; checklist vaza entre academias.

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 3–4 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Academia | Academia Demo Nova |
| Lead | João Teste — trial |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | Dashboard + banner | "Ao criar a academia, o Nave guia os primeiros passos." | Menos tela em branco |
| 2 | Continuar → lead | "Primeiro contato no funil em um clique." | Time-to-value |
| 3 | Agente IA | "Conecto WhatsApp e ensino a IA a atender." | Automação desde o dia 1 |
| 4 | Financeiro | "Cadastro o plano — o checklist já marca como feito." | Inteligência do progresso |
| 5 | Dispensar | "Quando não preciso mais, fecho e foco na operação." | Não atrapalha o dia a dia |

### O que não mostrar

- JSON bruto de `onboardingChecklist` no Appwrite
- Overflow `fba` (contas bancárias) — detalhe técnico de persistência

---

## Variações e atalhos

- **Persistência:** `serializeOnboardingChecklistForDb` grava só `{ id, done }`; títulos vêm de `ONBOARDING_STEP_TITLES`
- **Overflow financeiro:** contas podem ir para envelope `fba` em `onboardingChecklist` quando `financeConfig` estoura limite — ver `financeConfigStorage.js`
- **Reabrir checklist:** store `onboardingChecklistReopenNonce` limpa dismiss
- **Fluxos relacionados:** [config-inicial-financeiro.md](../financeiro/config-inicial-financeiro.md), [funil-lead-matricula.md](../crm/funil-lead-matricula.md), [pdv-nova-venda.md](../vendas/pdv-nova-venda.md)

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-15 | — | Criação Fase 3 |
