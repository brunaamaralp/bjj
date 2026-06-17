# Catraca Control iD — gaps de prioridade alta — TECH Spec

**Data:** 2026-06-17  
**Status:** Implementado (2026-06-17)  
**PRODUCT:** [2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md](./2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md)

---

## 1. Arquitetura implementada

```
Integrações → ControlIdCatracaSection.jsx (seções: servidor, equipamento, regras, status)
  → saveControlIdConfig / testControlIdConnection (controlidApi.js)
  → api/leads?route=controlid_save_config | controlid_test

academy.settings JSON:
  controlid: {
    enabled, ip, port, username, password*, portal_id,
    relay_url, block_overdue_access, entry_cooldown_minutes, last_sync
  }

lib/server/controlidDevice.js
  → relay_url (academia) ou CONTROLID_RELAY_URL (env) → POST /controlid-proxy

Operação:
  RecepcaoLivePanel → pollControlIdMonitor → processAccessEvent
    → events (presença) + ignored (cooldown/overdue)
  releaseControlIdGate → controlidReleaseHandler (ensureAcademyAccess)
    → releaseGate + lead_events manual_release

F4 inadimplência:
  runCollectionOverdueCron / studentPaymentsHandler
    → scheduleControlIdOverdueReconcile → controlidOverdueAccess.js
  sync / sync-all → shouldDenyOverdueAttendance (não re-sincroniza inadimplente)
```

**Arquivos-chave:** `lib/controlidSettings.js`, `lib/controlidCooldown.js`, `lib/controlidRelease.js`, `lib/server/controlidHandlers.js`, `lib/server/controlidOverdueAccess.js`, `lib/server/controlidService.js`, `lib/server/controlidDevice.js`, `src/components/academy/ControlIdCatracaSection.jsx`, `src/components/attendance/RecepcaoLivePanel.jsx`, `src/components/attendance/ControlIdReleaseDialog.jsx`, `src/lib/controlIdSyncBadgeMeta.js`, `src/pages/Dashboard.jsx`

---

## 2. Schema — `academy.settings.controlid`

Estender `readControlIdConfig` / `mergeControlIdIntoSettings` em `lib/controlidSettings.js`:

```js
{
  enabled: boolean,
  ip: string,
  port: number,           // default 80
  username: string,
  password: string,       // encrypted at rest
  portal_id: number,

  // novos (v1)
  relay_url: string,      // ex. "http://192.168.18.61:4000" — trim, sem trailing slash
  block_overdue_access: boolean,  // default false
  entry_cooldown_minutes: number, // 0–240, default 0
  last_sync: string,      // ISO 8601 UTC
}
```

**Validação no save (`controlidSaveConfigHandler`):**

- `relay_url`: se preenchido, `http://` ou `https://` + host (`validateRelayUrl`)
- `entry_cooldown_minutes`: clamp 0–240
- `block_overdue_access`: só aceitar `true` se `academyHasFinanceModule(academy)`

---

## 3. Relay URL por academia

### `lib/server/controlidDevice.js`

```js
function relayUrl(config) {
  const fromAcademy = String(config?.relay_url || '').trim().replace(/\/+$/, '');
  if (fromAcademy) return fromAcademy;
  return String(process.env.CONTROLID_RELAY_URL || '').trim().replace(/\/+$/, '');
}
```

- `controlIdDeviceRequest(config, ...)` já recebe `config` — propagar `relay_url` via `configWithPlainPassword` em `controlidService.js` (ler de `readControlIdConfig`).

### UI — `ControlIdCatracaSection.jsx`

- Campo texto `relay_url` com placeholder `http://192.168.18.61:4000`
- Hint: “Deixe vazio para usar o servidor padrão da instalação (variável de ambiente).”
- Incluir no payload de `saveControlIdConfig` e `testControlIdConnection`

### Teste de conexão

- `controlidTestHandler` já usa `testConnection` → sem mudança de endpoint; relay da academia passa automaticamente se salvo antes do teste.

---

## 4. Última sincronização

### Gravação

Helper novo em `lib/server/controlidHandlers.js` (ou `controlidSettings.js`):

```js
async function touchControlIdLastSync(academyId) {
  const academy = await loadAcademy(academyId);
  const merged = mergeControlIdIntoSettings(academy.settings, {
    last_sync: new Date().toISOString(),
  });
  await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
    settings: JSON.stringify(merged),
  });
}
```

Chamar após sucesso em:

- `controlidSyncHandler` (sync individual)
- `controlidSyncAllHandler` (ao final, mesmo se `failed > 0` — registrar “última tentativa”; PRODUCT aceita)
- `controlidSyncLeadServer` (cron trancamento / re-sync inadimplência)

**Não** chamar em revoke.

### UI

- `useAcademyControlId` já expõe `last_sync` via `fetchControlIdStatus`
- `ControlIdCatracaSection`: bloco somente leitura formatado com `date-fns` + `ptBR`
- Após “Sincronizar todos” no histórico, invalidar/refetch status (opcional: callback ou SWR mutate)

---

## 5. Justificativa na liberação manual

### API — `controlidReleaseHandler`

**Request body:**

```json
{
  "reason": "Visitante aguardando aula experimental",
  "lead_id": "opcional"
}
```

**Validação:**

- `reason`: trim, length 3–500; senão `400 { sucesso: false, erro: 'Informe o motivo da liberação (3 a 500 caracteres).' }`

**Persistência — `addLeadEventServer`:**

```js
{
  type: 'manual_release',
  text: `Liberação manual: ${reason.slice(0, 120)}`,
  createdBy: me.$id,
  payloadJson: {
    source: 'controlid',
    portal_id: config.portal_id,
    reason,
    released_by: me.$id,
    released_by_name: me.name || me.email || 'Usuário',
  },
}
```

### Attendance (opcional v1, recomendado)

Estender feed manual em `RecepcaoLivePanel` para incluir `release_reason` no objeto local.

Se quiser persistir em `attendance`:

- Usar `buildManualAttendanceDocument` com campos existentes: `checked_in_by`, `checked_in_by_name`, `source: 'manual'`
- Adicionar `note` ou campo existente no schema se houver; **senão** só `lead_events` (suficiente para auditoria v1)

### Cliente

| Arquivo | Mudança |
|---------|---------|
| `lib/controlidRelease.js` | Validação + chips de sugestão |
| `src/lib/controlidApi.js` | `releaseControlIdGate(academyId, { reason })` |
| `ControlIdReleaseDialog.jsx` | Modal compartilhado |
| `RecepcaoLivePanel.jsx` | Dialog + motivo no feed |
| `ControlIdAttendancePanel.jsx` | Dialog |
| `Dashboard.jsx` | Dialog (só se `enabled && configured`) |

---

## 6. Anti-passback (cooldown)

### Lógica — `processAccessEvent` em `controlidHandlers.js`

Antes de criar attendance:

```js
const cooldownMin = Number(config.entry_cooldown_minutes) || 0;
if (cooldownMin > 0 && ATTENDANCE_COL) {
  const since = new Date(Date.now() - cooldownMin * 60_000).toISOString();
  const recent = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('student_id', student.$id),
    Query.greaterThan('checked_in_at', since),
    Query.limit(1),
  ]);
  if (recent.total > 0) {
    return { leadId: student.$id, skipped: 'cooldown', name: student.name };
  }
}
```

- Resposta do monitor: `events`, `ignored`, `skipped_cooldown`, `skipped_overdue`.
- Feed ao vivo renderiza `ignored` com `controlIdIgnoreReasonLabel`.

### Índice Appwrite

- Query usa `academy_id` + `student_id` + `checked_in_at` — verificar índice composto na coleção `attendance`; documentar em provision se ausente.

---

## 7. Bloqueio por inadimplência

### Novo módulo — `lib/server/controlidOverdueAccess.js`

Implementado: `reconcileControlIdOverdueAccess`, `scheduleControlIdOverdueReconcile`, `shouldDenyOverdueAttendance`. Imports de `controlidService.js` para revoke/sync no equipamento.

### Hooks (implementados)

| Gatilho | Arquivo | Ação |
|---------|---------|------|
| Cron marca/clear overdue | `lib/server/runCollectionOverdueCron.js` | Após `markStudentOverdueIfUnset` / `clearStudentOverdueIfSet`, chamar sync se Control iD ativo |
| Pagamento quitado | `lib/server/studentOverdueSync.js` → `syncStudentOverdueAfterPayment` | Após clear, re-sync |
| Pagamento handler | `lib/server/studentPaymentsHandler.js` | Já chama overdue sync — encadear |
| Matrícula / foto nova | `performEnrollment` / sync existente | Sem mudança |

**Background:** usar `void fn().catch(log)` — não bloquear resposta HTTP do pagamento.

### Guarda em `processAccessEvent` + sync

- `shouldDenyOverdueAttendance` em `processAccessEvent`, `controlidSyncHandler`, `controlid_sync_all`, `controlidSyncLeadServer`.
- `attendance_denied` na timeline quando entrada bloqueada.

### UI financeiro

- Cross-link: [cobranca-inadimplencia-PRODUCT.md](./2026-06-15-cobranca-inadimplencia-PRODUCT.md) — bloqueio de catraca implementado neste épico (Integrações → Catraca).

---

## 8. API surface (sem novos arquivos `/api/`)

| Rota existente | Mudança |
|----------------|---------|
| `POST api/leads?route=controlid_save_config` | Aceita `relay_url`, `block_overdue_access`, `entry_cooldown_minutes` |
| `GET /api/control-id/status` | `last_sync` para todos; `block_overdue_access` para todos; demais campos de config só admin |
| `POST api/leads?route=controlid_release` | Exige `reason`; `ensureAcademyAccess` |
| `POST api/leads?route=controlid_monitor` | Retorna `ignored`, `skipped_overdue`, `skipped_cooldown` |
| `POST api/leads?route=controlid_sync` | `touchControlIdLastSync`; skip overdue se bloqueio ativo |
| `POST api/leads?route=controlid_sync_all` | `touchControlIdLastSync`; `skipped_overdue` |

---

## 9. UI checklist (concluído)

| Arquivo | Mudança |
|---------|---------|
| `ControlIdCatracaSection.jsx` | Seções UX; relay, toggles, cooldown, last_sync, link recepção |
| `useAcademyControlId.js` | Novos campos do status |
| `controlidStatusHandler` | `block_overdue_access` público; config sensível só admin |
| `RecepcaoLivePanel.jsx` | `ControlIdReleaseDialog`; feed manual + ignoradas |
| `ControlIdAttendancePanel.jsx` | Dialog; última sync no banner; refresh pós sync-all |
| `Dashboard.jsx` | `ControlIdReleaseDialog`; botão só se configured |
| `ControlIdSyncBadge.jsx` + `controlIdSyncBadgeMeta.js` | Estado bloqueado inadimplente |
| `docs/flows/crm/recepcao-controlid.md` | Checklists F1–F4 |

---

## 10. Testes (implementados)

| Arquivo | Casos |
|---------|-------|
| `src/test/controlidSettings.test.js` | defaults, merge, relay_url, last_sync |
| `src/test/controlidRelease.test.js` | reason required, chips, summarize |
| `src/test/controlidCooldown.test.js` | clamp, shouldBlock |
| `src/test/controlidOverdueAccess.test.js` | flags overdue |
| `src/test/controlIdSyncBadgeMeta.test.js` | badge bloqueado vs pendente |

**Pendente (opcional):** testes de integração de `controlidHandlers` (sync-all skip, monitor ignored).

---

## 11. Segurança e multi-tenant

- `relay_url` por academia: relay local deve validar `CONTROLID_RELAY_SECRET` (já existe em `server/index.js`)
- Não expor `password` nem `relay_secret` no status API
- `block_overdue_access` e revoke só para `academyId` do contexto JWT
- Justificativa: sanitizar length; sem HTML; gravar em `payloadJson` (não executar)

---

## 12. Rollout

1. ~~Deploy servidor com leitura de novos campos~~ ✅
2. ~~Deploy UI Integrações~~ ✅
3. ~~Deploy justificativa (front + API mesmo deploy)~~ ✅
4. Habilitar bloqueio inadimplência em pilotos antes de default on — **operacional**
5. QA manual relay + hardware — **pendente**

---

## 13. Dependências

- Coleção `attendance` com índice para query de cooldown
- Módulo financeiro + atributos `overdue` no student (`provision:student-overdue-attrs`)
- Relay `server/index.js` rodando na recepção (inalterado)

---

## 14. Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Implementado F1–F4; specs e testes atualizados |
| 2026-06-17 | Rascunho inicial |
