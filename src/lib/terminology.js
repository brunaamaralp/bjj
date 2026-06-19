/**
 * Glossário de termos canônicos do Nave
 *
 * Regras:
 * - Pessoa pré-matrícula: labels.leads (configurável por academia) — use contactLabelSingular()
 * - Pessoa matriculada: terms.student / terms.students
 * - Cliente sem vínculo (venda): "Cliente avulso" (fixo)
 * - Salvar edição: "Salvar"
 * - Confirmar ação irreversível: "Confirmar [ação]"
 * - Registrar evento pontual: "Registrar"
 * - Concluir fluxo: "Concluir [fluxo]"
 * - Criar item novo: "Criar [item]"
 * - Fechar sem salvar: "Cancelar"
 * - Voltar de página: "Voltar"
 * - Excluir registro permanentemente: "Excluir"
 * - Desativar sem excluir: "Desativar" (produto) / "Desligar" (aluno/paciente)
 * - WhatsApp conectado: "WhatsApp conectado" (não "Instância ligada")
 */

import { useLeadStore } from '../store/useLeadStore.js';
import { LEAD_STATUS } from './leadStatus.js';
import { TERMS } from './terminologyData.js';

export { TERMS } from './terminologyData.js';

/** Singular do rótulo de contato pré-matrícula (ex.: "Leads" → "Lead"). */
export function contactLabelSingular(labels) {
  const plural = String(labels?.leads || 'Contatos').trim() || 'Contatos';
  if (plural.toLowerCase().endsWith('s') && plural.length > 1) {
    return plural.slice(0, -1);
  }
  return plural;
}

/** Rótulo de status operacional (valor salvo pode ser «Matriculado»). */
export function operationalStatusDisplayLabel(terms, status) {
  if (status === LEAD_STATUS.CONVERTED) return terms.convertedStatusUi;
  return status;
}

/** Rótulo de etapa do funil cujo id técnico é «Matriculado». */
export function pipelineStageDisplayLabel(terms, stageId) {
  if (String(stageId || '').trim() === 'Matriculado') return terms.pipelineEnrolledColumnLabel;
  return String(stageId || '').trim() || '—';
}

export function useTerms() {
  const vertical = useLeadStore((s) => s.vertical);
  return TERMS[vertical] || TERMS.fitness;
}
