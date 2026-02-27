import { Client, Account, Databases } from "appwrite";

const client = new Client()
    .setEndpoint("https://sfo.cloud.appwrite.io/v1")
    .setProject("699f020c00171ce26206");

const account = new Account(client);
const databases = new Databases(client);

// IDs para as collections e banco (necessários para o funcionamento do CRM)
export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "699f06a6001a11c21825";
export const LEADS_COL = import.meta.env.VITE_APPWRITE_LEADS_COLLECTION_ID || "699f10500032d0fd5b80";
export const ACADEMIES_COL = import.meta.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || "699f1068000e1b1ca1d2";

console.log('🔌 Appwrite Config Loaded:');
console.log('   - Database:', DB_ID);
console.log('   - Leads Col:', LEADS_COL);
console.log('   - Academies Col:', ACADEMIES_COL);

export { client, account, databases };
export default client;
