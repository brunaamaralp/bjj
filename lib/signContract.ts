import { createDocument, deleteDocument } from './autentique/autentiqueService.js';
import { createContract, saveSigners } from './contracts/contractService.js';
import { buildSignersLinks } from './contracts/signersLinks.js';
import { matchInputSignerToAutentiqueSignature } from './contracts/contractAutentiqueSync.js';
import type { SignContractData, SignContractResult, SignerInput, SignerSaveInput } from './contracts/types.js';
import type { AutentiqueDocument, AutentiqueSignature } from './autentique/types.js';

function mapAutentiqueSignersToSave(
  autentiqueDoc: AutentiqueDocument,
  inputSigners: SignerInput[]
): SignerSaveInput[] {
  const signatures = autentiqueDoc.signatures || [];
  const usedIds = new Set<string>();

  return inputSigners.map((input) => {
    const matched = matchInputSignerToAutentiqueSignature(input, signatures, usedIds);
    const sig: AutentiqueSignature | undefined = matched
      ? signatures.find((s) => s.public_id === matched.public_id)
      : undefined;

    if (sig?.public_id) usedIds.add(sig.public_id);

    if (!sig) {
      console.warn('[contracts] signer_match_miss', {
        inputEmail: input.email || null,
        inputName: input.name || null,
      });
    }

    return {
      autentique_public_id: sig?.public_id,
      autentique_document_id: autentiqueDoc.id,
      email: sig?.email ?? input.email ?? null,
      name: sig?.name ?? input.name ?? null,
      phone: input.phone ?? null,
      action: sig?.action?.name ?? input.action ?? 'SIGN',
      delivery_method: input.delivery_method ?? null,
      status: 'pending',
    };
  });
}

/**
 * Orquestra criação na Autentique + persistência no Appwrite.
 * Erro na Autentique: não grava no Appwrite e relança.
 * Erro no Appwrite após Autentique: loga e retorna o documento da Autentique.
 */
export async function signContract(
  contractData: SignContractData,
  fileBuffer: Buffer | Blob
): Promise<SignContractResult> {
  const autentiqueDocument = await createDocument({
    name: contractData.name,
    message: contractData.message,
    signers: contractData.signers,
    file: fileBuffer,
    sandbox: Boolean(contractData.sandbox),
    sortable: contractData.signers.length > 1,
  });

  try {
    const signersLinks = buildSignersLinks(autentiqueDocument, contractData.signers);

    const contract = await createContract({
      name: contractData.name,
      autentique_id: autentiqueDocument.id,
      status: 'pending',
      sandbox: Boolean(contractData.sandbox),
      academy_id: contractData.academy_id,
      lead_id: contractData.lead_id,
      template_id: contractData.template_id,
      signers_links: JSON.stringify(signersLinks),
      expires_at: contractData.expires_at,
    });

    const signers = await saveSigners(
      contract.$id,
      mapAutentiqueSignersToSave(autentiqueDocument, contractData.signers)
    );

    return { contract, autentiqueDocument, signers };
  } catch (appwriteErr) {
    const message = appwriteErr instanceof Error ? appwriteErr.message : String(appwriteErr);
    try {
      const rolledBack = await deleteDocument(autentiqueDocument.id);
      if (!rolledBack) {
        console.error('[contracts] appwrite_save_failed', {
          autentiqueId: autentiqueDocument.id,
          academyId: contractData.academy_id ?? null,
          leadId: contractData.lead_id ?? null,
          error: message,
          rolledBack: false,
        });
      }
    } catch (rollbackErr) {
      const rollbackMessage =
        rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
      console.error('[contracts] appwrite_save_failed', {
        autentiqueId: autentiqueDocument.id,
        academyId: contractData.academy_id ?? null,
        leadId: contractData.lead_id ?? null,
        error: message,
        rollbackFailed: true,
        rollbackError: rollbackMessage,
      });
    }
    return {
      contract: null,
      autentiqueDocument,
      signers: [],
      appwriteError: message,
    };
  }
}
