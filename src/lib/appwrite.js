import { Client, Account, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);

export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;
export const LEADS_COL = import.meta.env.VITE_APPWRITE_LEADS_COLLECTION_ID;
export const ACADEMIES_COL = import.meta.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID;

export default client;
