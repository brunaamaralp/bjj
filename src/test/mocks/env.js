import { vi } from 'vitest';

vi.stubEnv('VITE_APPWRITE_DATABASE_ID', 'test-db');
vi.stubEnv('VITE_APPWRITE_LEADS_COLLECTION_ID', 'test-leads');
vi.stubEnv('VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID', 'test-events');

process.env.VITE_APPWRITE_DATABASE_ID = 'test-db';
process.env.VITE_APPWRITE_LEADS_COLLECTION_ID = 'test-leads';
process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID = 'test-events';
