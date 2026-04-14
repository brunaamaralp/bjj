import { vi } from 'vitest';

export const databases = {
  createDocument: vi.fn().mockResolvedValue({ $id: 'mock-id' }),
  updateDocument: vi.fn().mockResolvedValue({}),
  listDocuments: vi.fn().mockResolvedValue({
    documents: [],
    total: 0
  }),
  getDocument: vi.fn().mockResolvedValue({})
};

export const ID = { unique: vi.fn(() => 'mock-unique-id') };
export const Query = {
  equal: vi.fn((k, v) => `equal(${k},${v})`),
  notEqual: vi.fn((k, v) => `notEqual(${k},${v})`),
  orderDesc: vi.fn((k) => `orderDesc(${k})`),
  limit: vi.fn((n) => `limit(${n})`),
  isNull: vi.fn((k) => `isNull(${k})`)
};
