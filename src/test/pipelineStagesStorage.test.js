import { describe, it, expect } from 'vitest';
import {
  readStagesConfigRawFromAcademyDoc,
  mergeStagesConfigIntoSettings,
  buildAcademyStagesConfigSavePayload,
} from '../lib/pipelineStagesStorage.js';

const sampleStages = [
  { id: 'Novo', label: 'Novo', slaDays: 3 },
  { id: 'Aula experimental', label: 'Experimental', slaDays: 3 },
];

describe('pipelineStagesStorage', () => {
  it('lê stagesConfig de settings quando não há atributo de topo', () => {
    const doc = {
      settings: JSON.stringify({
        sales: { enabled: true },
        stagesConfig: sampleStages,
      }),
    };
    expect(readStagesConfigRawFromAcademyDoc(doc)).toEqual(sampleStages);
  });

  it('prioriza atributo legado stagesConfig no topo do documento', () => {
    const doc = {
      stagesConfig: JSON.stringify([{ id: 'legado', label: 'Legado', slaDays: 1 }]),
      settings: JSON.stringify({ stagesConfig: sampleStages }),
    };
    expect(readStagesConfigRawFromAcademyDoc(doc)).toBe(doc.stagesConfig);
  });

  it('grava apenas em settings (sem atributo desconhecido)', () => {
    const doc = { settings: JSON.stringify({ stockCheckSchedule: { enabled: false } }) };
    const payload = buildAcademyStagesConfigSavePayload(doc, sampleStages);
    expect(payload).toEqual({
      settings: JSON.stringify({
        stockCheckSchedule: { enabled: false },
        stagesConfig: sampleStages,
      }),
    });
    expect(payload.stagesConfig).toBeUndefined();
  });

  it('mergeStagesConfigIntoSettings preserva demais chaves', () => {
    const merged = mergeStagesConfigIntoSettings(
      JSON.stringify({ followupPlaybook: { version: 1 } }),
      sampleStages
    );
    expect(merged.followupPlaybook).toEqual({ version: 1 });
    expect(merged.stagesConfig).toEqual(sampleStages);
  });
});
