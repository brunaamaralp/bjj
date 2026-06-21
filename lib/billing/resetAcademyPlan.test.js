import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub do PLAN_CONFIG para não depender de import.meta.env
vi.mock('../../src/lib/planConfig.js', () => ({
  PLAN_CONFIG: {
    starter: { threads: 300 },
    studio: { threads: 800 },
    pro: { threads: 2000 },
  },
}));

function makeDb(impl = async () => ({})) {
  return { updateDocument: vi.fn(impl) };
}

describe('resetAcademyPlanToDefault', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-test';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'academies-test';
  });

  it('atualiza academies com plan=starter e ai_threads_limit=300', async () => {
    const { resetAcademyPlanToDefault } = await import('./resetAcademyPlan.js');
    const db = makeDb();
    await resetAcademyPlanToDefault(db, 'academy_1');
    expect(db.updateDocument).toHaveBeenCalledOnce();
    const [, , id, payload] = db.updateDocument.mock.calls[0];
    expect(id).toBe('academy_1');
    expect(payload.plan).toBe('starter');
    expect(payload.ai_threads_limit).toBe(300);
    expect(typeof payload.plan_updated_at).toBe('string');
  });

  it('idempotente — segunda chamada escreve os mesmos valores sem erro', async () => {
    const { resetAcademyPlanToDefault } = await import('./resetAcademyPlan.js');
    const db = makeDb();
    await resetAcademyPlanToDefault(db, 'academy_2');
    await resetAcademyPlanToDefault(db, 'academy_2');
    expect(db.updateDocument).toHaveBeenCalledTimes(2);
    const payload1 = db.updateDocument.mock.calls[0][3];
    const payload2 = db.updateDocument.mock.calls[1][3];
    expect(payload1.plan).toBe(payload2.plan);
    expect(payload1.ai_threads_limit).toBe(payload2.ai_threads_limit);
  });

  it('não chama updateDocument quando academyId está vazio', async () => {
    const { resetAcademyPlanToDefault } = await import('./resetAcademyPlan.js');
    const db = makeDb();
    await resetAcademyPlanToDefault(db, '');
    expect(db.updateDocument).not.toHaveBeenCalled();
  });

  it('engole erro do updateDocument sem propagar', async () => {
    const { resetAcademyPlanToDefault } = await import('./resetAcademyPlan.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb(async () => { throw new Error('Appwrite indisponível'); });
    await expect(resetAcademyPlanToDefault(db, 'academy_3')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
