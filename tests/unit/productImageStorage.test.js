import { describe, it, expect } from 'vitest';
import {
  isAllowedProductImageMime,
  buildProductImageViewUrl,
  getProductImagesBucketId,
} from '../../lib/server/productImageStorage.js';

describe('productImageStorage', () => {
  it('isAllowedProductImageMime accepts jpg/png/webp', () => {
    expect(isAllowedProductImageMime('image/jpeg')).toBe(true);
    expect(isAllowedProductImageMime('image/png')).toBe(true);
    expect(isAllowedProductImageMime('image/webp')).toBe(true);
    expect(isAllowedProductImageMime('image/gif')).toBe(false);
  });

  it('buildProductImageViewUrl monta URL de visualização', () => {
    const prev = process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID = 'product_images';
    const url = buildProductImageViewUrl('file123');
    expect(url).toContain('/storage/buckets/product_images/files/file123/view');
    if (prev === undefined) delete process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    else process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID = prev;
  });

  it('getProductImagesBucketId usa fallback product_images', () => {
    const prev = process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    const prevVite = process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    delete process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    delete process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID;
    expect(getProductImagesBucketId()).toBe('product_images');
    if (prev !== undefined) process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID = prev;
    if (prevVite !== undefined) process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID = prevVite;
  });
});
