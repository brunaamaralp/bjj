import { MAX_CONTRACT_PDF_BYTES, ContractFormError } from './parseContractForm.js';
import { getContractTemplatePdfBuffer } from './contractTemplateService.js';
import { buildContractVariableMap } from './contractTemplateVars.js';

export async function resolveContractPdfBuffer(input: {
  academyId: string;
  templateId?: string;
  leadId?: string;
}): Promise<{ buffer: Buffer; templateId?: string }> {
  const templateId = String(input.templateId || '').trim();
  if (!templateId) {
    throw new ContractFormError('Selecione um modelo de contrato');
  }

  const variableMap = await buildContractVariableMap({
    academyId: input.academyId,
    leadId: input.leadId,
  });

  const { buffer, template } = await getContractTemplatePdfBuffer(
    templateId,
    input.academyId,
    variableMap
  );
  if (buffer.length > MAX_CONTRACT_PDF_BYTES) {
    throw new ContractFormError('PDF do modelo excede 10 MB');
  }
  return { buffer, templateId: template.$id };
}
