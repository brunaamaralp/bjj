/**
 * Cria o bucket Appwrite `product_images` (fotos de produtos na Loja).
 *
 * Uso: npm run provision:product-images-bucket
 *      node --env-file=.env scripts/ensure-product-images-bucket.mjs
 */
import { Client, Storage, Permission, Role } from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const KEY = process.env.APPWRITE_API_KEY || '';
const BUCKET_ID =
  process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID ||
  process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID ||
  'product_images';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('Defina APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID e APPWRITE_API_KEY no .env');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const storage = new Storage(client);

try {
  const existing = await storage.getBucket(BUCKET_ID);
  console.log('Bucket já existe:', existing.$id, `(max ${existing.maximumFileSize} bytes)`);
} catch {
  const created = await storage.createBucket(
    BUCKET_ID,
    'product_images',
    [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    false,
    true,
    MAX_FILE_SIZE,
    ALLOWED_EXTENSIONS
  );
  console.log('Bucket criado:', created.$id);
}

console.log('\nVariáveis sugeridas no .env e na Vercel:');
console.log(`APPWRITE_PRODUCT_IMAGES_BUCKET_ID=${BUCKET_ID}`);
console.log(`VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID=${BUCKET_ID}`);
