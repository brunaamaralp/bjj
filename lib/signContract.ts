import { createDocument } from './autentique/autentiqueService.js';
import { createContract, saveSigners } from './contracts/contractService.js';
import type { SignContractData, SignContractResult, SignerInput, SignerSaveInput } from './contracts/types.js';
import type { AutentiqueDocument, AutentiqueSignature } from './autentique/types.js';

function mapAutentiqueSignersToSave(
  autentiqueDoc: AutentiqueDocument,
  inputSigners: SignerInput[]
): SignerSaveInput[] {
  const signatures = autentiqueDoc.signatures || [];

  return signatures.map((sig: AutentiqueSignature, index: number) => {
    const input = inputSigners[index] || {};
    return {
      autentique_public_id: sig.public_id,
      autentique_document_id: autentiqueDoc.id,
      email: sig.email ?? input.email ?? null,
      name: sig.name ?? input.name ?? null,
      phone: input.phone ?? null,
      action: sig.action?.name ?? input.action ?? 'SIGN',
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
    signers: contractData.signers,
    file: fileBuffer,
    sandbox: Boolean(contractData.sandbox),
  });

  try {
    const contract = await createContract({
      name: contractData.name,
      autentique_id: autentiqueDocument.id,
      status: 'pending',
      sandbox: Boolean(contractData.sandbox),
      academy_id: contractData.academy_id,
      lead_id: contractData.lead_id,
    });

    const signers = await saveSigners(
      contract.$id,
      mapAutentiqueSignersToSave(autentiqueDocument, contractData.signers)
    );

    return { contract, autentiqueDocument, signers };
  } catch (appwriteErr) {
    const message = appwriteErr instanceof Error ? appwriteErr.message : String(appwriteErr);
    console.error('[signContract] Appwrite falhou após criar na Autentique', {
      autentiqueId: autentiqueDocument.id,
      error: message,
    });
    return {
      contract: null,
      autentiqueDocument,
      signers: [],
      appwriteError: message,
    };
  }
}
