import { createDocument, deleteDocument, getDocument, signDocument } from './autentique/autentiqueService.js';
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

  return inputSigners.map((input, signerIndex) => {
    const matched = matchInputSignerToAutentiqueSignature(input, signatures, usedIds, signerIndex);
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

    const signedAt = sig?.signed?.created_at || null;
    let status = 'pending';
    if (signedAt) status = 'signed';

    return {
      autentique_public_id: sig?.public_id,
      autentique_document_id: autentiqueDoc.id,
      email: sig?.email ?? input.email ?? null,
      name: sig?.name ?? input.name ?? null,
      phone: input.phone ?? null,
      action: sig?.action?.name ?? input.action ?? 'SIGN',
      delivery_method: input.delivery_method ?? null,
      status,
      signed_at: signedAt,
    };
  });
}

function resolveInitialContractStatus(autentiqueDoc: AutentiqueDocument): string {
  const signatures = autentiqueDoc.signatures || [];
  if (!signatures.length) return 'pending';
  const allSigned = signatures.every((s) => Boolean(s.signed?.created_at));
  if (allSigned) return 'finished';
  const anySigned = signatures.some((s) => Boolean(s.signed?.created_at));
  if (anySigned) return 'in_progress';
  return 'pending';
}

async function refreshAutentiqueDocument(documentId: string): Promise<AutentiqueDocument | null> {
  const remote = await getDocument(documentId);
  if (!remote) return null;
  return {
    id: remote.id,
    name: remote.name || '',
    signatures: (remote.signatures || []).map((s) => ({
      public_id: s.public_id,
      name: s.name,
      email: s.email,
      action: s.action,
      link: s.link,
      signed: s.signed,
    })),
  };
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
  const multiSigner = contractData.signers.length > 1;
  const useSortable = contractData.autoSignAcademy ? false : multiSigner;

  let autentiqueDocument = await createDocument({
    name: contractData.name,
    message: contractData.message,
    signers: contractData.signers,
    file: fileBuffer,
    sandbox: Boolean(contractData.sandbox),
    sortable: useSortable,
  });

  let autoSign: SignContractResult['autoSign'];

  if (contractData.autoSignAcademy) {
    try {
      await signDocument(autentiqueDocument.id);
      const refreshed = await refreshAutentiqueDocument(autentiqueDocument.id);
      if (refreshed) autentiqueDocument = refreshed;
      autoSign = { applied: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[contracts] academy_auto_sign_failed', {
        autentiqueId: autentiqueDocument.id,
        error: message,
      });
      autoSign = {
        applied: false,
        warning: `Contrato enviado, mas a auto-assinatura da academia falhou: ${message}`,
      };
    }
  }

  try {
    const signersLinks = buildSignersLinks(autentiqueDocument, contractData.signers);
    const initialStatus = resolveInitialContractStatus(autentiqueDocument);

    const contract = await createContract({
      name: contractData.name,
      autentique_id: autentiqueDocument.id,
      status: initialStatus,
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

    return { contract, autentiqueDocument, signers, autoSign };
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
      autoSign,
    };
  }
}
