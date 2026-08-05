# Catraca retenção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make retention easy to scan (full-width list with reason phrases) and make hero KPIs Em risco / Sumidos filter that list with a clearable chip.

**Architecture:** Stack live feed above `AttendanceAtRiskSection` (drop desktop sidebar split). Persist status filter in `ret_status` URL param. Pure helper builds the reason phrase; section renders list rows instead of dense table.

**Tech Stack:** React, react-router `useSearchParams`, existing `FilterTag`, Vitest.

**Spec:** [2026-08-05-catraca-retencao-visibilidade-design.md](../specs/2026-08-05-catraca-retencao-visibilidade-design.md)

---

### Task 1: Reason phrase helper + tests

**Files:**
- Create: `src/lib/attendanceRetentionReasonPhrase.js`
- Create: `src/test/attendanceRetentionReasonPhrase.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect } from 'vitest';
import { buildAttendanceRetentionReasonPhrase } from '../lib/attendanceRetentionReasonPhrase.js';

describe('buildAttendanceRetentionReasonPhrase', () => {
  it('sumido com dias', () => {
    expect(
      buildAttendanceRetentionReasonPhrase({
        status: 'absent',
        daysWithoutCheckin: 18,
        checkinsLast7Days: 0,
        weeklyCheckinsExpected: 3,
      })
    ).toBe('Sumido · 18 dias sem treinar');
  });

  it('em risco abaixo da meta', () => {
    expect(
      buildAttendanceRetentionReasonPhrase({
        status: 'at_risk',
        daysWithoutCheckin: 9,
        checkinsLast7Days: 1,
        weeklyCheckinsExpected: 3,
      })
    ).toBe('Abaixo da meta (1/3) · 9 dias sem treinar');
  });

  it('normaliza newcomer legado para em risco', () => {
    const phrase = buildAttendanceRetentionReasonPhrase({
      status: 'newcomer_at_risk',
      daysWithoutCheckin: 7,
      checkinsLast7Days: 0,
      weeklyCheckinsExpected: 2,
    });
    expect(phrase.startsWith('Abaixo da meta')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement helper**

```js
import {
  ATTENDANCE_RISK_STATUS,
  normalizeAttendanceRiskStatus,
} from '../../lib/attendanceRetentionCore.js';

export function buildAttendanceRetentionReasonPhrase(row = {}) {
  const status = normalizeAttendanceRiskStatus(row.status);
  const days = Number(row.daysWithoutCheckin);
  const daysPart = Number.isFinite(days) && days >= 0 ? `${days} dias sem treinar` : 'sem check-in recente';
  if (status === ATTENDANCE_RISK_STATUS.ABSENT) {
    return `Sumido · ${daysPart}`;
  }
  const expected = Number(row.weeklyCheckinsExpected) || 2;
  const count = Number(row.checkinsLast7Days);
  const countSafe = Number.isFinite(count) ? Math.max(0, count) : 0;
  return `Abaixo da meta (${countSafe}/${expected}) · ${daysPart}`;
}
```

- [ ] **Step 3: Run** `npm test -- attendanceRetentionReasonPhrase` — expect PASS

- [ ] **Step 4: Commit** `feat(retention): add reason phrase helper`

---

### Task 2: URL status filter helpers

**Files:**
- Modify: `src/lib/recepcaoHubTabs.js` (or small `src/lib/attendanceRetentionFilters.js`)
- Modify: `src/test/recepcaoHubTabs.test.js` (or new test)

Constants: `URL_RET_STATUS = 'ret_status'`, values `at_risk` | `absent`.

Helpers:
- `resolveRetentionStatusFilter(value)` → `'at_risk' | 'absent' | ''`
- `patchRetentionStatusParam(searchParams, status)` 
- `buildRecepcaoRetencaoPath({ status })` already exists — extend to accept `retStatus`

- [ ] Tests for resolve + path with `&ret_status=absent`
- [ ] Commit `feat(retention): ret_status URL filter helpers`

---

### Task 3: Refactor `AttendanceAtRiskSection` list UI + filter chip

**Files:**
- Modify: `src/components/attendance/AttendanceAtRiskSection.jsx`
- Modify: `src/components/attendance/attendance-at-risk.css`

- [ ] Read `ret_status` from URL; filter `rows` client-side with `normalizeAttendanceRiskStatus`
- [ ] Show `FilterTag` when filter active: `Filtrando: Em risco` / `Filtrando: Sumidos`
- [ ] Replace `ReportDataTable` with list of `.attendance-at-risk-row-card` items: name/meta, badge, phrase, actions
- [ ] Remove `layout === 'sidebar'` special cases and inner KPI pills (hero owns KPIs)
- [ ] Keep turma/belt filters + all action handlers
- [ ] Commit `feat(retention): list rows with reason phrase and status chip`

---

### Task 4: Stack layout in `RecepcaoCatracaTab` + hero KPI wiring

**Files:**
- Modify: `src/components/recepcao/RecepcaoCatracaTab.jsx`
- Modify: `src/components/recepcao/RecepcaoPresenceHero.jsx`
- Modify: `src/styles/dashboard.css`

- [ ] Remove `desktopSplitLive` / `recepcao-presence-grid`
- [ ] Always: subTabs (if integration) → live panel when live|retencao → retention below when attendanceReady and not historico
- [ ] On `section=retencao`: scroll to `#retencao` on mount/change
- [ ] Hero: `onScrollToRetention(status)` sets `ret_status` + navigates section + scrolls; Entradas unchanged; Ativos no click
- [ ] Remove unused grid CSS; keep scroll max-height optional on list
- [ ] Commit `feat(recepcao): stack retention below live feed`

---

### Task 5: Flow docs + hub tests

**Files:**
- Modify: `docs/flows/crm/recepcao-controlid.md`
- Modify: `docs/flows/crm/hoje-dashboard.md`
- Modify: `docs/flows/VALIDATION.md` (short note)
- Modify: `src/test/recepcaoHubTabs.test.js` if paths changed

- [ ] Document stack layout, KPI filter behavior, `ret_status`
- [ ] Run relevant tests: `npm test -- attendanceRetentionReasonPhrase recepcaoHubTabs`
- [ ] Commit `docs(flows): catraca retention stack and KPI filters`

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| G1 full-width below feed | 4 |
| G2 reason phrase | 1, 3 |
| G3 filter + chip | 2, 3, 4 |
| G4 Entradas / Ativos | 4 |
| G5 deep link | 2, 4 |
| Non-goal no API change | — |
| Flow docs | 5 |
