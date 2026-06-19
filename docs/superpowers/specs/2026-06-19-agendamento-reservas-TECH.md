# TECH — Agendamento de Reservas (Fases 7–10)

> Referência: [PRODUCT spec](./2026-06-19-agendamento-reservas-PRODUCT.md)  
> Data: 2026-06-19  
> Status: Implementação em andamento

---

## Decisões de arquitetura

### Domínio puro (sem I/O)
`lib/bookingCore.js` — constantes, validações e builders puros. Sem dependências Appwrite.  
`lib/bookingDateTime.js` — utilitários de data/hora com timezone via `Intl.DateTimeFormat`. Sem `date-fns` nem `moment`.

### Sem nova serverless function
Tudo em funções existentes (limite Hobby 12/12):

| Rota / ação | Destino |
|---|---|
| `GET /api/leads?route=bookings&action=list-slots` | `lib/server/bookingsHandler.js` via `api/leads.js` |
| `GET /api/leads?route=bookings&action=list-bookings` | idem |
| `POST /api/leads?route=bookings&action=create` | idem |
| `POST /api/leads?route=bookings&action=cancel` | idem |
| `POST /api/leads?route=bookings&action=checkin` | idem |
| `GET /api/cron/generate-class-slots` | `api/cron/reset-usage.js?action=generate-class-slots` (rewrite) |
| `GET /api/cron/mark-booking-no-shows` | `api/cron/reset-usage.js?action=mark-booking-no-shows` (rewrite) |

### Crons (vercel.json)
- `generate-class-slots` — diário 05:30 UTC (02:30 BRT) — gera `class_slots` com horizonte de 14 dias
- `mark-booking-no-shows` — diário 03:00 UTC (00:00 BRT) — fecha slots passados e marca `no_show`

---

## Coleções Appwrite

### `class_slots`
| Campo | Tipo | Descrição |
|---|---|---|
| `academy_id` | string | FK lógico → academies |
| `class_id` | string | FK lógico → classes |
| `schedule_id` | string | FK lógico → schedules |
| `slot_date` | string | YYYY-MM-DD |
| `weekday` | string | mon…sun |
| `time_start` | string | HH:MM |
| `time_end` | string | HH:MM |
| `starts_at` | datetime | UTC ISO |
| `ends_at` | datetime | UTC ISO |
| `name` | string | nome desnormalizado |
| `modality` | string | bjj / mma / etc |
| `instructor` | string | desnormalizado |
| `level` | string | desnormalizado |
| `max_capacity` | integer? | null = ilimitado |
| `booked_count` | integer | contagem ativa |
| `checked_in_count` | integer | entradas confirmadas |
| `status` | string | scheduled / completed / cancelled |
| `generated_at` | datetime | timestamp de criação |

**Índices necessários:**
- `academy_id + slot_date` (list-slots por dia)
- `academy_id + starts_at` (range queries para catraca)
- `schedule_id + slot_date` (idempotência do gerador)

### `bookings`
| Campo | Tipo | Descrição |
|---|---|---|
| `academy_id` | string | |
| `slot_id` | string | FK → class_slots |
| `class_id` | string | desnormalizado |
| `schedule_id` | string | desnormalizado |
| `student_id` | string | FK → students ou leads |
| `student_name` | string | desnormalizado |
| `status` | string | booked / checked_in / cancelled / no_show |
| `booked_at` | datetime | |
| `booked_by` | string | user.$id |
| `booked_by_name` | string | |
| `source` | string | reception / staff / system |
| `checked_in_at` | datetime? | |
| `checked_in_source` | string? | manual / catraca |
| `attendance_id` | string? | FK → attendance |
| `device_log_id` | string? | FK → controlid log |
| `cancelled_at` | datetime? | |
| `cancel_reason` | string? | |
| `cancelled_by` | string? | |
| `no_show_at` | datetime? | |
| `waitlist_position` | integer? | futuro |

**Índices necessários:**
- `slot_id + status` (contagem de ativos por slot)
- `slot_id + student_id` (verificação de duplicata)
- `academy_id + student_id` (histórico por aluno)

---

## Módulos server-side

### `lib/bookingCore.js`
Funções puras:
- `parseBookingSettings(raw)` — lê config de `settings.booking.*`
- `resolveMaxCapacity(schedule, classDoc)` — cascata schedule → class → null
- `buildClassSlotDocument({...})` — monta payload de slot com UTC instants
- `isWithinCheckinWindow(checkedInAt, slotStartsAt, config)` — janela de check-in
- `slotStartsAtSearchRange(checkedInAt, config)` — range para busca de slots candidatos
- `countActiveBookings(bookings)` — apenas status=booked
- `hasCapacityForBooking(maxCapacity, activeCount)` — boolean

### `lib/bookingDateTime.js`
- `localDateTimeToUtcIso(dateYmd, timeHHMM, timeZone)` — timezone-safe
- `todayYmdInTz(timeZone, ref)` — hoje em YMD
- `weekdayCodeInTz(dateYmd, timeZone)` — mon…sun
- `addDaysYmd(dateYmd, days, timeZone)` — soma dias sem drift DST
- `dateRangeYmd(startYmd, count, timeZone)` — lista de YMDs

### `lib/server/classSlotGenerator.js`
- `generateSlotsForAcademy(databases, dbId, academyId, opts)` — idempotente; verifica `slotExists` antes de criar
- `planSlotsForSchedules(schedules, classesMap, dates, academyId, timeZone)` — pure; usado em testes

### `lib/server/bookingsHandler.js`
Handler `api/leads.js?route=bookings&action=*`:
- `list-slots` — lista slots por data com paginação
- `list-bookings` — lista bookings de um slot
- `create` — cria booking com validação de capacidade e duplicata; incrementa `booked_count`
- `cancel` — cancela booking; decrementa `booked_count`
- `checkin` — cria attendance manual; chama `applyBookingCheckinMatch`

### `lib/server/bookingAttendanceMatch.js`
- `matchBookingForCheckin(databases, dbId, params)` — busca slot + booking para check-in de catraca
- `applyBookingCheckinMatch(databases, dbId, params)` — aplica check-in: atualiza booking, slot e attendance

### `lib/server/runClassSlotsCron.js`
- `runClassSlotsCron(databases, dbId)` — percorre academias com paginação; chama `generateSlotsForAcademy`

### `lib/server/runBookingNoShowCron.js`
- `runBookingNoShowCron(databases, dbId)` — percorre slots `status=scheduled` com `ends_at ≤ now`; marca bookings `booked → no_show`; marca slot `scheduled → completed`

---

## Frontend

### Stores (`src/store/`)

**`classSlotsStore.js`**
- State: `slots`, `loading`, `error`, `fetchedDate`
- `fetchSlotsForDate(academyId, dateYmd)` — GET `/api/leads?route=bookings&action=list-slots&date=YYYY-MM-DD`
- Chamada via API autenticada (JWT + `x-academy-id`)

**`bookingsStore.js`**
- State: `bookingsBySlot` (Map slotId → booking[]), `loading`, `mutatingSlotIds`
- `fetchBookingsForSlot(slotId)` — GET `...&action=list-bookings&slot_id=XXX`
- `createBooking(slotId, studentId)` — POST `...&action=create`
- `cancelBooking(bookingId, slotId)` — POST `...&action=cancel`
- `checkinBooking(bookingId, slotId)` — POST `...&action=checkin`

### Componente `RecepcaoTodaySlotsSection.jsx`
Exibido na aba **Agenda** (ex-Experimentais):
- Lista slots do dia ordenados por horário
- Cada slot mostra: nome, horário, instrutor, capacidade (`booked/max`)
- Expandível: lista bookings; botões check-in / cancelar
- Botão "Inscrever aluno" → busca em students/leads → cria booking

### Renomear aba
`src/lib/recepcaoHubTabs.js`:
- `RECEPCAO_TAB_EXPERIMENTAIS = 'experimentais'` → manter constante (backward compat)
- Label: `'Experimentais'` → `'Agenda'`
- Badge: passa a considerar `slotsCount` além de `followUpCount`

---

## Integração catraca → booking (Fase 9)

No webhook de catraca (`api/whatsapp.js` / `lib/server/controlidHandlers.js`), após salvar attendance:
1. Chamar `matchBookingForCheckin(databases, dbId, { academyId, studentId, checkedInAtIso })`
2. Se encontrar match: chamar `applyBookingCheckinMatch(...)` com `matchType: 'catraca'`
3. Log: `booking_matched_catraca` ou `booking_no_match_catraca`

Janela default: starts_at - 30 min … starts_at + 15 min (configurável por academia em `settings.booking`).

---

## Testes

`src/test/bookingCore.test.js` (vitest):
- 10 casos passando: `resolveMaxCapacity`, `countActiveBookings`, `hasCapacityForBooking`, `parseBookingSettings`, `isWithinCheckinWindow`, `buildClassSlotDocument`, `weekdayCodeInTz`, `addDaysYmd`, `localDateTimeToUtcIso`, `planSlotsForSchedules`

---

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID` | Client + server |
| `VITE_APPWRITE_BOOKINGS_COLLECTION_ID` | Client + server |
| `APPWRITE_CLASS_SLOTS_COLLECTION_ID` | Server only (cron) |
| `APPWRITE_BOOKINGS_COLLECTION_ID` | Server only (cron) |

---

## Fases de implementação

| Fase | Escopo | Status |
|---|---|---|
| 7 | Gerador de slots + crons | ✅ Feito |
| 8 | API bookings + frontend agenda | 🔄 Em andamento |
| 9 | Match catraca → booking | Pendente |
| 10 | Self-service (aluno reserva pelo WhatsApp) | Futuro |
