/**
 * Campos derivados da classificação do agente WhatsApp (cliente + servidor).
 */

export function mapAgentProfileToLeadType(perfilLead) {
  const p = String(perfilLead || '').trim();
  if (p === 'responsavel_crianca') return 'Criança';
  if (p === 'responsavel_junior') return 'Juniores';
  if (p === 'adulto_para_si') return 'Adulto';
  return null;
}

/**
 * @param {object|null|undefined} classificacao
 * @returns {Record<string, unknown>}
 */
export function buildLeadFieldsFromClassification(classificacao) {
  if (!classificacao || typeof classificacao !== 'object') return {};

  const patch = {};
  const intencao = String(classificacao.intencao || '').trim();
  const prioridade = String(classificacao.prioridade || '').trim();
  const leadQuente = String(classificacao.lead_quente || '').trim().toLowerCase();
  const needHuman = String(classificacao.precisa_resposta_humana || '').trim().toLowerCase() === 'sim';
  const tipoContato = String(classificacao.tipo_contato || '').trim();
  const perfil = String(classificacao.perfil_lead || '').trim();

  if (intencao) patch.whatsapp_intention = intencao.slice(0, 64);
  if (prioridade) patch.whatsapp_priority = prioridade.slice(0, 32);
  patch.whatsapp_lead_quente = leadQuente === 'sim' ? 'sim' : 'nao';
  patch.need_human = needHuman;
  if (tipoContato) patch.whatsapp_contact_type = tipoContato.slice(0, 16);
  if (perfil) patch.whatsapp_lead_profile = perfil.slice(0, 32);
  patch.whatsapp_classified_at = new Date().toISOString();

  const typeFromProfile = mapAgentProfileToLeadType(perfil);
  if (typeFromProfile) patch.type = typeFromProfile;

  return patch;
}

/**
 * Patch ao confirmar triagem usando classificação já persistida no lead.
 * @param {object|null|undefined} lead
 */
export function buildTriageConfirmPatch(lead) {
  const patch = { triage_status: 'confirmed' };
  const perfil =
    lead?.whatsappLeadProfile ||
    lead?.whatsapp_lead_profile ||
    lead?.whatsapp_lead_profile;
  const mapped = mapAgentProfileToLeadType(perfil);
  if (mapped) patch.type = mapped;
  return patch;
}

/** CamelCase patch for client updateLead. */
export function buildTriageConfirmClientPatch(lead) {
  const patch = { triageStatus: 'confirmed' };
  const perfil = lead?.whatsappLeadProfile || lead?.whatsapp_lead_profile;
  const mapped = mapAgentProfileToLeadType(perfil);
  if (mapped) patch.type = mapped;
  return patch;
}
