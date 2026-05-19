import { Client, Storage, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const BUCKET_ID = () => String(process.env.APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID || '').trim();

let storageClient: Storage | null = null;

function getStorage(): Storage {
  if (!PROJECT_ID || !API_KEY) throw new Error('contract_template_storage_not_configured');
  if (!BUCKET_ID()) throw new Error('contract_templates_bucket_not_configured');
  if (!storageClient) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    storageClient = new Storage(client);
  }
  return storageClient;
}

export function isContractTemplateStorageConfigured(): boolean {
  return Boolean(PROJECT_ID && API_KEY && BUCKET_ID());
}

export function buildTemplateFileViewUrl(fileId: string): string {
  const bucket = BUCKET_ID();
  const project = PROJECT_ID;
  return `${ENDPOINT}/storage/buckets/${bucket}/files/${fileId}/view?project=${project}`;
}

export async function uploadTemplatePdf(
  fileBuffer: Buffer,
  filename = 'template.pdf'
): Promise<{ fileId: string; viewUrl: string }> {
  const storage = getStorage();
  const input = InputFile.fromBuffer(fileBuffer, filename, 'application/pdf');
  const created = await storage.createFile(BUCKET_ID(), ID.unique(), input);
  const fileId = created.$id;
  return { fileId, viewUrl: buildTemplateFileViewUrl(fileId) };
}

export async function downloadTemplatePdf(fileId: string): Promise<Buffer> {
  const storage = getStorage();
  const arrayBuffer = await storage.getFileDownload(BUCKET_ID(), String(fileId));
  return Buffer.from(arrayBuffer);
}

export async function deleteTemplateFile(fileId: string): Promise<void> {
  if (!fileId || !isContractTemplateStorageConfigured()) return;
  const storage = getStorage();
  try {
    await storage.deleteFile(BUCKET_ID(), String(fileId));
  } catch {
    void 0;
  }
}
