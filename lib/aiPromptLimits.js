/** Limites de caracteres para prompt_intro / prompt_body (servidor + UI). */
export const PROMPT_INTRO_MAX_LEN = 8000;
export const PROMPT_BODY_MAX_LEN = 24000;
export const PROMPT_SUFFIX_MAX_LEN = 4000;

/** Recomendação exibida na UI (intro + body). */
export const PROMPT_RECOMMENDED_COMBINED_LEN = 15000;

/** Teto do system prompt montado (intro + regras + FAQ + classificação). */
export const AGENT_SYSTEM_PROMPT_MAX_CHARS = 100000;

export function isPromptContentConfigured(intro, body) {
  return Boolean(String(intro || '').trim() || String(body || '').trim());
}

export function validatePromptFields(intro, body) {
  const i = String(intro || '');
  const b = String(body || '');
  if (!i.trim() && !b.trim()) {
    return { ok: false, erro: 'Informe identidade ou conhecimento do assistente antes de salvar.' };
  }
  if (i.length > PROMPT_INTRO_MAX_LEN) {
    return { ok: false, erro: `Identidade excede ${PROMPT_INTRO_MAX_LEN} caracteres` };
  }
  if (b.length > PROMPT_BODY_MAX_LEN) {
    return { ok: false, erro: `Conhecimento excede ${PROMPT_BODY_MAX_LEN} caracteres` };
  }
  return { ok: true };
}
