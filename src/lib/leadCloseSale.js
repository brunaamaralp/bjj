import { LEAD_STATUS } from './leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

export function mapLeadToPaymentContact(lead) {
  if (!lead) return null;
  return {
    id: lead.id,
    name: String(lead.name || lead.nome || '').trim(),
    plan: lead.plan || '',
    plan_price: lead.plan_price ?? lead.planPrice,
    preferredPaymentMethod: lead.preferredPaymentMethod || '',
    preferredPaymentAccount: lead.preferredPaymentAccount || '',
  };
}

export function isLeadEnrolledStudent(lead) {
  if (!lead) return false;
  return (
    lead.status === LEAD_STATUS.CONVERTED || String(lead.contact_type || '').trim() === 'student'
  );
}

export function canShowLeadCloseSale(lead) {
  if (!lead) return false;
  return lead.status !== LEAD_STATUS.CONVERTED && lead.status !== LEAD_STATUS.LOST;
}

export function canShowPipelineCloseSale(lead) {
  if (!lead) return false;
  const stage = String(lead.pipelineStage || '').trim();
  return stage === 'Aula experimental' || stage === PIPELINE_WAITING_DECISION_STAGE;
}
