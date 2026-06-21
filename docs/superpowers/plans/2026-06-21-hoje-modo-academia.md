# Hoje — Modo Academia (Crescimento / Consolidação) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar chip de modo na página Hoje que alterna entre blocos de "Crescimento" (comportamento atual) e "Consolidação" (alunos em risco, financeiro, relacionamento).

**Architecture:** Chip de modo em `Dashboard.jsx` persiste escolha em `localStorage` keyed por `academyId`. No modo Consolidação, três novos componentes de bloco são renderizados no lugar da seção principal — cada um consome dados já disponíveis (store de students + API de retenção existente). Nenhum novo arquivo de API é necessário na Fase 1.

**Tech Stack:** React 18, hooks existentes (`useLeadStore`, `useStudentStore`), API existente (`/api/reports/attendance-retention`), `lib/attendanceRetentionCore.js`, `src/lib/studentEnrollmentDate.js`, `src/lib/studentStatus.js`.

**Spec:** [`docs/superpowers/specs/2026-06-21-hoje-modo-academia-PRODUCT.md`](../specs/2026-06-21-hoje-modo-academia-PRODUCT.md)

---

## Mapa de Arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Criar | `src/components/dashboard/AcademyModeChip.jsx` | Chip toggle Crescimento / Consolidação |
| Criar | `src/components/dashboard/ConsolidacaoAtRiskBlock.jsx` | Bloco de alunos em risco de abandono |
| Criar | `src/components/dashboard/ConsolidacaoFinanceiroBlock.jsx` | Bloco overdue + vencendo em breve |
| Criar | `src/components/dashboard/ConsolidacaoRelacionamentoBlock.jsx` | Bloco aniversários + 1 ano de matrícula |
| Criar | `src/hooks/useConsolidacaoRelacionamento.js` | Derivação de aniversariantes e jubileus (pure, sem fetch) |
| Modificar | `src/pages/Dashboard.jsx` | Estado de modo, chip, renderização condicional |
| Modificar | `src/index.css` | Classes CSS para chip e blocos de consolidação |

---

## Task 1 — Chip toggle `AcademyModeChip.jsx`

**Files:**
- Create: `src/components/dashboard/AcademyModeChip.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
// src/components/dashboard/AcademyModeChip.jsx
export const ACADEMY_MODE_CRESCIMENTO = 'crescimento';
export const ACADEMY_MODE_CONSOLIDACAO = 'consolidacao';

/**
 * @param {{ mode: string, onChange: (mode: string) => void }} props
 */
export default function AcademyModeChip({ mode, onChange }) {
  return (
    <div className="academy-mode-chip" role="group" aria-label="Modo da academia">
      <button
        className={`academy-mode-chip__btn${mode === ACADEMY_MODE_CRESCIMENTO ? ' academy-mode-chip__btn--active' : ''}`}
        onClick={() => onChange(ACADEMY_MODE_CRESCIMENTO)}
        aria-pressed={mode === ACADEMY_MODE_CRESCIMENTO}
        type="button"
      >
        🌱 Crescimento
      </button>
      <button
        className={`academy-mode-chip__btn${mode === ACADEMY_MODE_CONSOLIDACAO ? ' academy-mode-chip__btn--active' : ''}`}
        onClick={() => onChange(ACADEMY_MODE_CONSOLIDACAO)}
        aria-pressed={mode === ACADEMY_MODE_CONSOLIDACAO}
        type="button"
      >
        🏛️ Consolidação
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar CSS em `src/index.css`**

Adicionar ao final do arquivo (antes do último fechamento de bloco, se houver):

```css
/* ── Academy Mode Chip ─────────────────────────────────── */
.academy-mode-chip {
  display: inline-flex;
  gap: 0;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border, #e5e7eb);
  overflow: hidden;
  background: var(--color-surface, #fff);
  margin-bottom: 16px;
}

.academy-mode-chip__btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #6b7280);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1.4;
}

.academy-mode-chip__btn:hover {
  background: var(--color-surface-hover, #f9fafb);
  color: var(--color-text, #111827);
}

.academy-mode-chip__btn--active {
  background: var(--color-primary, #1d4ed8);
  color: #fff;
}

.academy-mode-chip__btn--active:hover {
  background: var(--color-primary-hover, #1e40af);
}

/* ── Consolidação blocks ───────────────────────────────── */
.consolidacao-block {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  padding: 16px 20px;
  margin-bottom: 16px;
}

.consolidacao-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.consolidacao-block__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #111827);
  display: flex;
  align-items: center;
  gap: 6px;
}

.consolidacao-block__link {
  font-size: 12px;
  color: var(--color-primary, #1d4ed8);
  text-decoration: none;
  white-space: nowrap;
}

.consolidacao-block__link:hover { text-decoration: underline; }

.consolidacao-block__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-subtle, #f3f4f6);
  gap: 8px;
}

.consolidacao-block__row:last-child { border-bottom: none; }

.consolidacao-block__row-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #111827);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.consolidacao-block__row-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
}

.consolidacao-block__row-meta--danger { color: var(--color-danger, #dc2626); }
.consolidacao-block__row-meta--warn   { color: var(--color-warn, #d97706); }

.consolidacao-block__empty {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  text-align: center;
  padding: 12px 0;
}

.consolidacao-block__wa-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  cursor: pointer;
  color: var(--color-text-secondary, #6b7280);
  transition: background 0.12s, color 0.12s;
  text-decoration: none;
}

.consolidacao-block__wa-btn:hover {
  background: #dcfce7;
  border-color: #16a34a;
  color: #15803d;
}

.consolidacao-blocks-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}
```

- [ ] **Step 3: Commit**

```
git add src/components/dashboard/AcademyModeChip.jsx src/index.css
git commit -m "feat(hoje): chip toggle Crescimento/Consolidação + CSS base"
```

---

## Task 2 — Hook `useConsolidacaoRelacionamento.js`

Computa aniversariantes do dia e alunos que completam 1 ano de matrícula nos próximos 7 dias — puramente derivado de `students`, sem fetch.

**Files:**
- Create: `src/hooks/useConsolidacaoRelacionamento.js`

- [ ] **Step 1: Criar o hook**

```js
// src/hooks/useConsolidacaoRelacionamento.js
import { useMemo } from 'react';
import { enrollmentDateYmd, formatLocalYmd } from '../lib/studentEnrollmentDate.js';
import { isActiveStudent } from '../lib/studentStatus.js';

/**
 * Retorna aniversariantes do dia e alunos que completam 1 ano de matrícula
 * nos próximos 7 dias — calculado localmente dos students já no store.
 *
 * @param {object[]} students — lista de alunos do useStudentStore
 * @returns {{ todayBirthdays: object[], oneYearAnniversaries: object[] }}
 */
export function useConsolidacaoRelacionamento(students) {
  return useMemo(() => {
    const today = new Date();
    const todayMMDD = formatLocalYmd(today).slice(5); // "MM-DD"

    // Janela de 7 dias para jubileus de 1 ano
    const windowStart = new Date(today);
    windowStart.setFullYear(today.getFullYear() - 1);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 7);
    const windowStartYmd = formatLocalYmd(windowStart); // "YYYY-MM-DD"
    const windowEndYmd   = formatLocalYmd(windowEnd);

    const todayBirthdays = [];
    const oneYearAnniversaries = [];

    for (const s of students || []) {
      if (!isActiveStudent(s)) continue;

      // Aniversário de nascimento
      const birth = String(s.birthDate || s.birth_date || '').trim();
      if (birth) {
        // birthDate pode ser "MM-DD" ou "YYYY-MM-DD"
        const mmdd = birth.length === 5 ? birth : birth.slice(5, 10);
        if (mmdd === todayMMDD) todayBirthdays.push(s);
      }

      // Jubileu de 1 ano de matrícula (janela de 7 dias)
      const enroll = enrollmentDateYmd(s); // "YYYY-MM-DD" ou ''
      if (enroll && enroll >= windowStartYmd && enroll <= windowEndYmd) {
        oneYearAnniversaries.push(s);
      }
    }

    return { todayBirthdays, oneYearAnniversaries };
  }, [students]);
}
```

- [ ] **Step 2: Commit**

```
git add src/hooks/useConsolidacaoRelacionamento.js
git commit -m "feat(hoje): hook useConsolidacaoRelacionamento (aniversários + 1 ano)"
```

---

## Task 3 — `ConsolidacaoAtRiskBlock.jsx`

Bloco de alunos em risco de abandono. Consome `/api/reports/attendance-retention` via `fetchAttendanceRetention`. Guarda: se `!isAttendanceConfigured()`, exibe orientação sem fazer fetch.

**Files:**
- Create: `src/components/dashboard/ConsolidacaoAtRiskBlock.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
// src/components/dashboard/ConsolidacaoAtRiskBlock.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAttendanceConfigured } from '../../lib/attendance.js';
import { fetchAttendanceRetention } from '../../lib/attendanceRetentionApi.js';

const MAX_ROWS = 5;

export default function ConsolidacaoAtRiskBlock({ academyId }) {
  const [rows, setRows] = useState(null);    // null = loading, [] = empty, [...] = data
  const [hasRealCheckins, setHasRealCheckins] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    if (!academyId || !isAttendanceConfigured()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await fetchAttendanceRetention({ academyId, lookbackDays: 60 });
      if (ctrl.signal.aborted) return;
      // Guard: se não há check-ins reais, o lookback retorna todos como sumidos
      // baseado apenas no enrollmentDate — sinaliza para o usuário
      const totalAtRisk = (data.summary?.at_risk ?? 0) + (data.summary?.absent ?? 0) + (data.summary?.newcomer_at_risk ?? 0);
      const active = data.summary?.active ?? 0;
      // Heurística: se 100% dos elegíveis estão "em risco" e nenhum ativo, provavelmente sem check-ins reais
      const eligible = data.summary?.eligible ?? (totalAtRisk + active);
      const suspectNoCheckins = eligible > 0 && active === 0 && totalAtRisk > 0;
      setHasRealCheckins(!suspectNoCheckins);
      setRows((data.at_risk || []).slice(0, MAX_ROWS));
    } catch {
      if (!ctrl.signal.aborted) setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  if (!isAttendanceConfigured()) {
    return (
      <div className="consolidacao-block">
        <div className="consolidacao-block__header">
          <span className="consolidacao-block__title">⚠️ Alunos em risco</span>
        </div>
        <p className="consolidacao-block__empty">
          Ative o registro de frequência (catraca ou manual) para monitorar ausências.
        </p>
      </div>
    );
  }

  if (!hasRealCheckins && rows?.length > 0) {
    return (
      <div className="consolidacao-block">
        <div className="consolidacao-block__header">
          <span className="consolidacao-block__title">⚠️ Alunos em risco</span>
        </div>
        <p className="consolidacao-block__empty">
          Nenhum registro de frequência encontrado nos últimos 60 dias.{' '}
          Registre presenças para ativar o monitoramento de ausências.
        </p>
      </div>
    );
  }

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">⚠️ Alunos em risco</span>
        <Link to="/reports?tab=frequencia" className="consolidacao-block__link">
          Ver relatório →
        </Link>
      </div>

      {rows === null && (
        <p className="consolidacao-block__empty">Carregando…</p>
      )}

      {error && (
        <p className="consolidacao-block__empty">Falha ao carregar. Tente recarregar.</p>
      )}

      {rows !== null && !error && rows.length === 0 && (
        <p className="consolidacao-block__empty">✅ Todos os alunos com presença regular.</p>
      )}

      {rows !== null && !error && rows.length > 0 && rows.map((r) => (
        <div key={r.studentId} className="consolidacao-block__row">
          <Link
            to={`/student/${r.studentId}`}
            className="consolidacao-block__row-name"
          >
            {r.name || r.studentId}
          </Link>
          <span className={`consolidacao-block__row-meta${r.daysWithoutCheckin >= 15 ? ' consolidacao-block__row-meta--danger' : ' consolidacao-block__row-meta--warn'}`}>
            {r.daysWithoutCheckin} dias sem treinar
          </span>
          {r.phone && (
            <a
              href={`https://wa.me/${String(r.phone).replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="consolidacao-block__wa-btn"
              aria-label={`Contatar ${r.name} pelo WhatsApp`}
            >
              WA
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/dashboard/ConsolidacaoAtRiskBlock.jsx
git commit -m "feat(hoje): ConsolidacaoAtRiskBlock — alunos em risco de abandono"
```

---

## Task 4 — `ConsolidacaoFinanceiroBlock.jsx`

Bloco financeiro: inadimplentes (de `students.overdue`) + vencendo nos próximos 7 dias (de `students.dueDay`). Computação 100% local — sem fetch adicional.

**Files:**
- Create: `src/components/dashboard/ConsolidacaoFinanceiroBlock.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
// src/components/dashboard/ConsolidacaoFinanceiroBlock.jsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { isActiveStudent } from '../../lib/studentStatus.js';

const MAX_ROWS = 5;

/**
 * Retorna true se o dueDay (dia do mês) cai nos próximos `windowDays` dias.
 * Approximação — não verifica se já pagou neste mês.
 */
function isDueSoon(dueDay, windowDays = 7) {
  const day = Number(dueDay);
  if (!day || Number.isNaN(day)) return false;
  const today = new Date();
  for (let i = 1; i <= windowDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDate() === day) return true;
  }
  return false;
}

export default function ConsolidacaoFinanceiroBlock({ students }) {
  const { overdue, upcoming } = useMemo(() => {
    const active = (students || []).filter((s) => isActiveStudent(s));
    return {
      overdue: active.filter((s) => s.overdue === true).slice(0, MAX_ROWS),
      upcoming: active
        .filter((s) => !s.overdue && isDueSoon(s.dueDay || s.due_day))
        .slice(0, MAX_ROWS),
    };
  }, [students]);

  const hasAny = overdue.length > 0 || upcoming.length > 0;

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">💰 Financeiro da semana</span>
        <Link to="/financeiro/mensalidades" className="consolidacao-block__link">
          Ver todos →
        </Link>
      </div>

      {!hasAny && (
        <p className="consolidacao-block__empty">✅ Sem mensalidades em atraso ou vencendo esta semana.</p>
      )}

      {overdue.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 6px' }}>
            Em atraso
          </p>
          {overdue.map((s) => (
            <div key={s.id} className="consolidacao-block__row">
              <Link to={`/student/${s.id}`} className="consolidacao-block__row-name">
                {s.name}
              </Link>
              <span className="consolidacao-block__row-meta consolidacao-block__row-meta--danger">
                Inadimplente
              </span>
              {s.phone && (
                <a
                  href={`https://wa.me/${String(s.phone).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="consolidacao-block__wa-btn"
                  aria-label={`Contatar ${s.name} pelo WhatsApp`}
                >
                  WA
                </a>
              )}
            </div>
          ))}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: `${overdue.length > 0 ? 12 : 4}px 0 6px` }}>
            Vencendo em breve
          </p>
          {upcoming.map((s) => (
            <div key={s.id} className="consolidacao-block__row">
              <Link to={`/student/${s.id}`} className="consolidacao-block__row-name">
                {s.name}
              </Link>
              <span className="consolidacao-block__row-meta consolidacao-block__row-meta--warn">
                Dia {s.dueDay || s.due_day}
              </span>
              {s.phone && (
                <a
                  href={`https://wa.me/${String(s.phone).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="consolidacao-block__wa-btn"
                  aria-label={`Contatar ${s.name} pelo WhatsApp`}
                >
                  WA
                </a>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/dashboard/ConsolidacaoFinanceiroBlock.jsx
git commit -m "feat(hoje): ConsolidacaoFinanceiroBlock — inadimplentes + vencendo em breve"
```

---

## Task 5 — `ConsolidacaoRelacionamentoBlock.jsx`

Bloco de relacionamento: aniversariantes do dia + jubileus de 1 ano de matrícula. Dados derivados de `students` via `useConsolidacaoRelacionamento`.

**Files:**
- Create: `src/components/dashboard/ConsolidacaoRelacionamentoBlock.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
// src/components/dashboard/ConsolidacaoRelacionamentoBlock.jsx
import { useConsolidacaoRelacionamento } from '../../hooks/useConsolidacaoRelacionamento.js';
import { enrollmentDateYmd } from '../../lib/studentEnrollmentDate.js';

export default function ConsolidacaoRelacionamentoBlock({
  students,
  zapsterInstanceId,
  onSendBirthday, // (student) => void — abre modal ou envia WA de parabéns
}) {
  const { todayBirthdays, oneYearAnniversaries } = useConsolidacaoRelacionamento(students);
  const hasAny = todayBirthdays.length > 0 || oneYearAnniversaries.length > 0;

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">🎂 Relacionamento</span>
      </div>

      {!hasAny && (
        <p className="consolidacao-block__empty">Sem aniversários ou jubileus hoje.</p>
      )}

      {todayBirthdays.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 6px' }}>
            🎂 Aniversariantes hoje
          </p>
          {todayBirthdays.map((s) => (
            <div key={s.id} className="consolidacao-block__row">
              <span className="consolidacao-block__row-name">{s.name}</span>
              {zapsterInstanceId && s.phone && (
                <button
                  type="button"
                  className="consolidacao-block__wa-btn"
                  onClick={() => onSendBirthday?.(s)}
                  aria-label={`Mandar parabéns para ${s.name}`}
                >
                  🎉 Parabenizar
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {oneYearAnniversaries.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: `${todayBirthdays.length > 0 ? 12 : 4}px 0 6px` }}>
            🏆 1 ano de matrícula
          </p>
          {oneYearAnniversaries.map((s) => {
            const enroll = enrollmentDateYmd(s);
            return (
              <div key={s.id} className="consolidacao-block__row">
                <span className="consolidacao-block__row-name">{s.name}</span>
                <span className="consolidacao-block__row-meta">
                  Desde {enroll ? new Date(enroll + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                </span>
                {zapsterInstanceId && s.phone && (
                  <a
                    href={`https://wa.me/${String(s.phone).replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="consolidacao-block__wa-btn"
                    aria-label={`Contatar ${s.name} pelo WhatsApp`}
                  >
                    WA
                  </a>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/dashboard/ConsolidacaoRelacionamentoBlock.jsx
git commit -m "feat(hoje): ConsolidacaoRelacionamentoBlock — aniversários + 1 ano de matrícula"
```

---

## Task 6 — Integração em `Dashboard.jsx`

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Adicionar imports no topo do arquivo** (após os imports existentes)

```js
// Adicionar junto aos imports de componentes de dashboard existentes:
import AcademyModeChip, {
  ACADEMY_MODE_CRESCIMENTO,
  ACADEMY_MODE_CONSOLIDACAO,
} from '../components/dashboard/AcademyModeChip.jsx';
import ConsolidacaoAtRiskBlock from '../components/dashboard/ConsolidacaoAtRiskBlock.jsx';
import ConsolidacaoFinanceiroBlock from '../components/dashboard/ConsolidacaoFinanceiroBlock.jsx';
import ConsolidacaoRelacionamentoBlock from '../components/dashboard/ConsolidacaoRelacionamentoBlock.jsx';
```

- [ ] **Step 2: Adicionar estado de modo** (após as declarações de estado existentes, ~linha 200)

```js
// Modo academia: 'crescimento' | 'consolidacao'
// Persiste por academia em localStorage para sobreviver a navegações.
const [academyMode, setAcademyMode] = useState(() => {
  if (typeof window === 'undefined' || !academyId) return ACADEMY_MODE_CRESCIMENTO;
  return localStorage.getItem(`hoje_modo_${academyId}`) || ACADEMY_MODE_CRESCIMENTO;
});

const handleAcademyModeChange = useCallback((mode) => {
  setAcademyMode(mode);
  if (academyId) localStorage.setItem(`hoje_modo_${academyId}`, mode);
}, [academyId]);

// Quando a academia muda (multi-academia), recarrega o modo salvo.
const prevAcademyIdRef = useRef(academyId);
useEffect(() => {
  if (prevAcademyIdRef.current !== academyId && academyId) {
    prevAcademyIdRef.current = academyId;
    const saved = localStorage.getItem(`hoje_modo_${academyId}`) || ACADEMY_MODE_CRESCIMENTO;
    setAcademyMode(saved);
  }
}, [academyId]);
```

- [ ] **Step 3: Adicionar leitura de students do store** (junto às outras leituras de store existentes)

Verificar se `students` já está sendo lido em Dashboard.jsx. Procurar por `useStudentStore`. Se já existe `const students = useStudentStore(s => s.students)`, nenhuma mudança. Se não existir, adicionar:

```js
const students = useStudentStore((s) => s.students);
```

- [ ] **Step 4: Adicionar o chip e os blocos de consolidação no JSX**

Localizar a linha onde começa `{hubTab === RECEPCAO_TAB_EXPERIMENTAIS ? (` (aproximadamente linha 1265).

Dentro desse branch, **logo antes** da `<section className="dashboard-day-hero">` (linha ~1267), adicionar:

```jsx
{/* Chip de modo — aparece sempre no tab Experimentais */}
<AcademyModeChip mode={academyMode} onChange={handleAcademyModeChange} />
```

Em seguida, envolver o conteúdo existente (hero + agenda stack) com condicional de modo:

```jsx
{academyMode === ACADEMY_MODE_CONSOLIDACAO ? (
  // ── MODO CONSOLIDAÇÃO ──────────────────────────────────────────
  <div className="consolidacao-blocks-grid">
    <ConsolidacaoAtRiskBlock academyId={academyId} />
    <ConsolidacaoFinanceiroBlock students={students} />
    <ConsolidacaoRelacionamentoBlock
      students={students}
      zapsterInstanceId={academyWa?.zapster_instance_id}
      onSendBirthday={(s) => {
        // Reutiliza o modal de aniversário já existente no Dashboard
        setBirthdayModalOpen(true);
      }}
    />
    {/* Experimentais do dia como bloco secundário compacto */}
    {todayScheduled.length > 0 && (
      <div className="consolidacao-block">
        <div className="consolidacao-block__header">
          <span className="consolidacao-block__title">📅 Experimentais hoje ({todayScheduled.length})</span>
        </div>
        {todayScheduled.slice(0, 3).map((lead) => (
          <div key={lead.$id || lead.id} className="consolidacao-block__row">
            <span className="consolidacao-block__row-name">{lead.name}</span>
            <span className="consolidacao-block__row-meta">{lead.scheduledTime || ''}</span>
          </div>
        ))}
        {todayScheduled.length > 3 && (
          <p className="consolidacao-block__empty" style={{ marginTop: 8 }}>
            + {todayScheduled.length - 3} outros
          </p>
        )}
      </div>
    )}
  </div>
) : (
  // ── MODO CRESCIMENTO (comportamento atual) ─────────────────────
  <>
    {/* conteúdo existente do RECEPCAO_TAB_EXPERIMENTAIS começa aqui */}
    <section className={`dashboard-day-hero ...`}>
      {/* manter exatamente como está */}
    </section>
    {/* ... manter o resto exatamente como está ... */}
  </>
)}
```

**IMPORTANTE:** O conteúdo do branch de crescimento (`<section className="dashboard-day-hero">`, zero state, `.agenda-page-stack`, etc.) deve ser preservado **sem nenhuma alteração** — apenas encapsulado dentro do `else` da condicional de modo.

- [ ] **Step 5: Commit**

```
git add src/pages/Dashboard.jsx
git commit -m "feat(hoje): integra chip de modo e blocos de consolidação em Dashboard.jsx"
```

---

## Task 7 — Verificação manual

- [ ] **Step 1: Iniciar o dev server e testar**

```powershell
npm run dev
```

Abrir `http://localhost:5173/` (ou porta configurada).

Checklist de verificação:
- [ ] Chip aparece na aba "Experimentais" da Recepção
- [ ] Modo "Crescimento" mostra o comportamento exatamente igual ao anterior (nenhuma regressão)
- [ ] Clicar em "Consolidação" troca os blocos imediatamente
- [ ] Recarregar a página preserva o modo selecionado (localStorage)
- [ ] Bloco de risco mostra "Ative o registro de frequência…" se `VITE_APPWRITE_ATTENDANCE_COL_ID` não estiver configurado
- [ ] Bloco financeiro mostra alunos com `overdue: true` (se houver na academia de teste)
- [ ] Bloco de relacionamento mostra aniversariantes (pode não ter nenhum no dia de teste — checar empty state)
- [ ] Links "Ver relatório →" e "Ver todos →" navegam corretamente

- [ ] **Step 2: Commit final e push**

```
git add .
git commit -m "feat(hoje): Modo Academia — Fase 1 completa (chip + 3 blocos consolidação)"
git push
```

---

## Checklist de Cobertura do Spec

| Requisito P0 | Coberto? | Task |
|---|---|---|
| Chip Crescimento / Consolidação | ✅ | Task 1, 6 |
| Modo padrão: Crescimento | ✅ | Task 6, Step 2 |
| Persistência localStorage por academyId | ✅ | Task 6, Step 2 |
| Troca imediata sem reload | ✅ | Task 6 (useState) |
| Bloco alunos em risco | ✅ | Task 3 |
| Guard: sem frequência configurada | ✅ | Task 3 |
| Guard: sem check-ins reais | ✅ | Task 3 (heurística 100% at-risk) |
| Empty state: "Todos com presença regular" | ✅ | Task 3 |
| Link "Ver relatório frequência" | ✅ | Task 3 |
| Bloco financeiro — overdue | ✅ | Task 4 |
| Bloco financeiro — vencendo em breve | ✅ | Task 4 (de `dueDay`, approximação) |
| Max 10 itens por subseção | ✅ | Task 4 (`MAX_ROWS = 5` por sub) |
| Link "Ver todos" financeiro | ✅ | Task 4 |
| Empty state financeiro | ✅ | Task 4 |
| Aniversariantes do dia | ✅ | Task 5 |
| 1 ano de matrícula (7 dias) | ✅ | Task 5 |
| Botão WA por aluno | ✅ | Tasks 3, 4, 5 |
| Experimentais como bloco secundário | ✅ | Task 6, Step 4 |
| Empty state experimental (sem experimentais) | ✅ | Task 6 (bloco não renderiza) |
| Modo Crescimento preservado sem alteração | ✅ | Task 6, Step 4 |

---

## Notas de Implementação

**`todayScheduled` no modo Consolidação:** A variável `todayScheduled` já é computada em Dashboard.jsx por `useDashboardLeadAgenda`. Verificar que está no escopo onde o JSX é renderizado — deve estar, pois é declarada antes do return.

**`setBirthdayModalOpen`:** O estado `birthdayModalOpen` já existe em Dashboard.jsx. O `onSendBirthday` do bloco de relacionamento pode simplesmente chamar `setBirthdayModalOpen(true)` — o modal existente (`DashboardBirthdayModal`) mostrará a lista completa de aniversariantes.

**`dueDay` vs `due_day`:** O campo no Appwrite é `due_day` (snake_case), mas `mapAppwriteStudentDoc.js` pode normalizar para `dueDay` (camelCase). Verificar qual field name está no objeto `student` do store — o componente já usa `s.dueDay || s.due_day` para cobrir ambos.

**Rota `/financeiro/mensalidades`:** Verificar se essa rota existe no `App.jsx`. Se a rota for diferente, ajustar o Link no `ConsolidacaoFinanceiroBlock`.
