import { MAX_CONTRACT_PDF_BYTES, ContractFormError } from './parseContractForm.js';
import { getContractTemplatePdfBuffer } from './contractTemplateService.js';

export async function resolveContractPdfBuffer(input: {
  academyId: string;
  templateId?: string;
  uploadFile?: Buffer;
}): Promise<{ buffer: Buffer; templateId?: string }> {
  if (input.uploadFile?.length) {
    if (input.uploadFile.length > MAX_CONTRACT_PDF_BYTES) {
      throw new ContractFormError('PDF muito grande. Tamanho máximo: 10 MB.');
    }
    return { buffer: input.uploadFile, templateId: input.templateId };
  }

  const templateId = String(input.templateId || '').trim();
  if (!templateId) {
    throw new ContractFormError('Informe um PDF ou selecione um modelo de contrato');
  }

  const { buffer, template } = await getContractTemplatePdfBuffer(templateId, input.academyId);
  if (buffer.length > MAX_CONTRACT_PDF_BYTES) {
    throw new ContractFormError('PDF do modelo excede 10 MB');
  }
  return { buffer, templateId: template.$id };
}
