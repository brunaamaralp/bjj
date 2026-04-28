import { useMemo } from 'react';

const BLOCKED_STAGES = ['Matriculado', 'Perdido', 'Perdidos', 'Não compareceu'];

const normalize = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const BLOCKED_NORMALIZED = new Set(BLOCKED_STAGES.map(normalize));

export function useSlaAlerts(leads, stages) {
  return useMemo(() => {
    const slaMap = {};
    (stages || []).forEach((s) => {
      const sid = String(s?.id || '').trim();
      const label = String(s?.label || '').trim();
      const slaDays = Number(s?.slaDays);
      const blocked = BLOCKED_NORMALIZED.has(normalize(sid)) || BLOCKED_NORMALIZED.has(normalize(label));
      if (!blocked && Number.isFinite(slaDays) && slaDays > 0) {
        slaMap[sid] = slaDays;
      }
    });

    const alerts = {};
    (leads || []).forEach((lead) => {
      const stageId = String(lead?.pipelineStage || '').trim();
      const slaDays = slaMap[stageId];
      if (!slaDays) return;

      const ref = lead?.pipelineStageChangedAt || lead?.createdAt;
      if (!ref) return;
      const refMs = new Date(ref).getTime();
      if (!Number.isFinite(refMs)) return;

      const nowMs = new Date().getTime();
      const daysInStage = Math.floor((nowMs - refMs) / 86400000);
      if (daysInStage >= slaDays) {
        alerts[lead.id] = {
          daysInStage,
          slaDays,
          urgency: daysInStage >= slaDays * 2 ? 'critical' : 'warning',
        };
      }
    });

    return alerts;
  }, [leads, stages]);
}
