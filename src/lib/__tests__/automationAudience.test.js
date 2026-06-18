import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  passesAudienceFilter,
  isAudienceEmpty,
  sanitizeAudience,
  buildAudienceLabel,
  estimateAudienceCount,
} from '../automationAudience.js';

vi.mock('../automationAudienceLog.js', () => ({
  logAudienceResult: vi.fn(),
}));
import { logAudienceResult } from '../automationAudienceLog.js';

const makeStudent = (overrides = {}) => ({
  $id: 'student-1',
  academy_id: 'academy-1',
  type: 'Adulto',
  plan: 'Studio',
  turma: 'Manhã',
  enrollmentDate: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
  ...overrides,
});

const makeAudience = (overrides = {}) => ({
  types: [],
  plans: [],
  turmas: [],
  tenure: null,
  ...overrides,
});

function daysAgoYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.mocked(logAudienceResult).mockClear();
});

describe('isAudienceEmpty', () => {
  it('retorna true quando audience é null ou undefined', () => {
    expect(isAudienceEmpty(null)).toBe(true);
    expect(isAudienceEmpty(undefined)).toBe(true);
  });

  it('retorna true quando todos os arrays são vazios e tenure é null', () => {
    expect(isAudienceEmpty(makeAudience())).toBe(true);
    expect(isAudienceEmpty({ types: [], plans: [], turmas: [], tenure: null })).toBe(true);
  });

  it('retorna false quando types tem valores', () => {
    expect(isAudienceEmpty(makeAudience({ types: ['Adulto'] }))).toBe(false);
  });

  it('retorna false quando plans tem valores', () => {
    expect(isAudienceEmpty(makeAudience({ plans: ['Studio'] }))).toBe(false);
  });

  it('retorna false quando turmas tem valores', () => {
    expect(isAudienceEmpty(makeAudience({ turmas: ['Manhã'] }))).toBe(false);
  });

  it('retorna false quando tenure é "novato"', () => {
    expect(isAudienceEmpty(makeAudience({ tenure: 'novato' }))).toBe(false);
  });

  it('retorna false quando tenure é "veterano"', () => {
    expect(isAudienceEmpty(makeAudience({ tenure: 'veterano' }))).toBe(false);
  });
});

describe('passesAudienceFilter — sem filtro', () => {
  it('retorna true quando audienceConfig é null', () => {
    expect(passesAudienceFilter(makeStudent(), null, { triggerKey: 'birthday' })).toBe(true);
  });

  it('retorna true quando audienceConfig está vazio (isAudienceEmpty)', () => {
    expect(passesAudienceFilter(makeStudent(), makeAudience(), { triggerKey: 'birthday' })).toBe(true);
  });

  it('não gera log quando não há filtro', () => {
    passesAudienceFilter(makeStudent(), null, { triggerKey: 'birthday' });
    passesAudienceFilter(makeStudent(), makeAudience(), { triggerKey: 'birthday' });
    expect(logAudienceResult).not.toHaveBeenCalled();
  });
});

describe('passesAudienceFilter — type', () => {
  it('passa quando student.type está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ type: 'Adulto' }),
        makeAudience({ types: ['Adulto', 'Criança'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha quando student.type não está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ type: 'Adulto' }),
        makeAudience({ types: ['Criança'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa e loga type_null_included quando student.type é null', () => {
    const ok = passesAudienceFilter(
      makeStudent({ type: null }),
      makeAudience({ types: ['Adulto'] }),
      { triggerKey: 'birthday', academyId: 'academy-1' }
    );
    expect(ok).toBe(true);
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: expect.arrayContaining(['type_null_included']) })
    );
  });

  it('passa e loga type_null_included quando student.type é undefined', () => {
    const ok = passesAudienceFilter(
      makeStudent({ type: undefined }),
      makeAudience({ types: ['Adulto'] }),
      { triggerKey: 'birthday' }
    );
    expect(ok).toBe(true);
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: expect.arrayContaining(['type_null_included']) })
    );
  });
});

describe('passesAudienceFilter — plan', () => {
  it('passa quando student.plan está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ plan: 'Studio' }),
        makeAudience({ plans: ['Studio', 'Pro'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha quando student.plan não está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ plan: 'Studio' }),
        makeAudience({ plans: ['Pro'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa e loga plan_null_included quando student.plan é null', () => {
    const ok = passesAudienceFilter(
      makeStudent({ plan: null }),
      makeAudience({ plans: ['Studio'] }),
      { triggerKey: 'birthday' }
    );
    expect(ok).toBe(true);
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: expect.arrayContaining(['plan_null_included']) })
    );
  });
});

describe('passesAudienceFilter — turma', () => {
  it('passa quando student.turma está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ turma: 'Manhã' }),
        makeAudience({ turmas: ['Manhã', 'Noite'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha quando student.turma não está na lista', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ turma: 'Manhã' }),
        makeAudience({ turmas: ['Noite'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa e loga turma_null_included quando student.turma é null', () => {
    const ok = passesAudienceFilter(
      makeStudent({ turma: null }),
      makeAudience({ turmas: ['Manhã'] }),
      { triggerKey: 'birthday' }
    );
    expect(ok).toBe(true);
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: expect.arrayContaining(['turma_null_included']) })
    );
  });
});

describe('passesAudienceFilter — tenure', () => {
  it('passa novato com enrollmentDate há 30 dias', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ enrollmentDate: daysAgoYmd(30) }),
        makeAudience({ tenure: 'novato' }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha novato com enrollmentDate há 90 dias', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ enrollmentDate: daysAgoYmd(90) }),
        makeAudience({ tenure: 'novato' }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa veterano com enrollmentDate há 90 dias', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ enrollmentDate: daysAgoYmd(90) }),
        makeAudience({ tenure: 'veterano' }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha veterano com enrollmentDate há 30 dias', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ enrollmentDate: daysAgoYmd(30) }),
        makeAudience({ tenure: 'veterano' }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa e loga enrollmentDate_null_included quando enrollmentDate é null', () => {
    const ok = passesAudienceFilter(
      makeStudent({ enrollmentDate: null, converted_at: null, convertedAt: null }),
      makeAudience({ tenure: 'novato' }),
      { triggerKey: 'birthday' }
    );
    expect(ok).toBe(true);
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: expect.arrayContaining(['enrollmentDate_null_included']) })
    );
  });

  it('usa fallback converted_at quando enrollmentDate é null mas converted_at existe', () => {
    vi.mocked(logAudienceResult).mockClear();
    const ok = passesAudienceFilter(
      makeStudent({
        enrollmentDate: null,
        converted_at: daysAgoYmd(30),
      }),
      makeAudience({ tenure: 'novato' }),
      { triggerKey: 'birthday' }
    );
    expect(ok).toBe(true);
    const last = vi.mocked(logAudienceResult).mock.calls.at(-1)?.[0];
    if (last) {
      expect(last.reasons).not.toContain('enrollmentDate_null_included');
    } else {
      expect(logAudienceResult).not.toHaveBeenCalled();
    }
  });
});

describe('passesAudienceFilter — AND lógico', () => {
  it('passa quando aluno atende todos os filtros ativos', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ type: 'Adulto', plan: 'Studio', turma: 'Manhã' }),
        makeAudience({ types: ['Adulto'], plans: ['Studio'], turmas: ['Manhã'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });

  it('falha quando aluno atende type mas não atende plan', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ type: 'Adulto', plan: 'Studio' }),
        makeAudience({ types: ['Adulto'], plans: ['Pro'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('falha quando aluno atende plan mas não atende turma', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ plan: 'Studio', turma: 'Manhã' }),
        makeAudience({ plans: ['Studio'], turmas: ['Noite'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(false);
  });

  it('passa com campo null em filtro secundário (null = incluído)', () => {
    expect(
      passesAudienceFilter(
        makeStudent({ type: 'Adulto', plan: null, turma: 'Manhã' }),
        makeAudience({ types: ['Adulto'], plans: ['Studio'], turmas: ['Manhã'] }),
        { triggerKey: 'birthday' }
      )
    ).toBe(true);
  });
});

describe('passesAudienceFilter — log', () => {
  it('não loga quando passed:true sem nenhuma razão (aluno limpo com filtro)', () => {
    vi.mocked(logAudienceResult).mockClear();
    passesAudienceFilter(
      makeStudent({ type: 'Adulto' }),
      makeAudience({ types: ['Adulto'] }),
      { triggerKey: 'birthday', academyId: 'academy-1' }
    );
    expect(logAudienceResult).not.toHaveBeenCalled();
  });

  it('loga quando passed:false com reasons corretas', () => {
    passesAudienceFilter(
      makeStudent({ type: 'Adulto' }),
      makeAudience({ types: ['Criança'] }),
      { triggerKey: 'birthday', academyId: 'academy-1' }
    );
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        reasons: expect.arrayContaining(['type_mismatch:Adulto']),
      })
    );
  });

  it('loga quando passed:true mas com field_null_included', () => {
    passesAudienceFilter(
      makeStudent({ plan: null }),
      makeAudience({ plans: ['Studio'] }),
      { triggerKey: 'birthday', academyId: 'academy-1' }
    );
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: true,
        reasons: expect.arrayContaining(['plan_null_included']),
      })
    );
  });

  it('inclui academy_id, trigger, student_id no log', () => {
    passesAudienceFilter(
      makeStudent({ $id: 'stu-99', type: 'Adulto' }),
      makeAudience({ types: ['Criança'] }),
      { triggerKey: 'absent_student', academyId: '699f21b70006985daa90' }
    );
    expect(logAudienceResult).toHaveBeenCalledWith(
      expect.objectContaining({
        academy_id: '699f21b70006985daa90',
        trigger: 'absent_student',
        student_id: 'stu-99',
      })
    );
  });
});

describe('sanitizeAudience + buildAudienceLabel', () => {
  it('sanitizeAudience normaliza arrays vazios', () => {
    expect(sanitizeAudience(null)).toEqual({
      types: [],
      plans: [],
      turmas: [],
      tenure: null,
    });
  });

  it('buildAudienceLabel retorna Todos os alunos sem filtros', () => {
    expect(buildAudienceLabel(makeAudience())).toBe('Todos os alunos');
  });
});

describe('estimateAudienceCount', () => {
  const students = [
    makeStudent({ $id: 's1', type: 'Adulto', plan: 'Studio', turma: 'Manhã' }),
    makeStudent({ $id: 's2', type: 'Criança', plan: 'Pro', turma: 'Kids' }),
    makeStudent({ $id: 's3', type: 'Adulto', plan: null, turma: 'Manhã' }),
  ];

  it('retorna total de alunos quando audiência está vazia', () => {
    expect(estimateAudienceCount(makeAudience(), students)).toBe(3);
    expect(estimateAudienceCount(null, students)).toBe(3);
  });

  it('retorna contagem correta com filtro de type', () => {
    expect(estimateAudienceCount(makeAudience({ types: ['Adulto'] }), students)).toBe(2);
  });

  it('retorna 0 quando nenhum aluno passa', () => {
    expect(estimateAudienceCount(makeAudience({ types: ['Juniores'] }), students)).toBe(0);
  });

  it('conta aluno com campo null (null = incluído)', () => {
    expect(
      estimateAudienceCount(makeAudience({ types: ['Adulto'], plans: ['Studio'] }), students)
    ).toBe(2);
  });

  it('não gera entradas em automation_logs', () => {
    vi.mocked(logAudienceResult).mockClear();
    estimateAudienceCount(makeAudience({ types: ['Adulto'], plans: ['Studio'] }), students);
    expect(logAudienceResult).not.toHaveBeenCalled();
  });
});
