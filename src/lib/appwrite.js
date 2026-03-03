import { Client, Account, Databases, Functions } from "appwrite";

const client = new Client()
    .setEndpoint("https://sfo.cloud.appwrite.io/v1")
    .setProject("699f020c00171ce26206");

const account = new Account(client);
const databases = new Databases(client);
const functions = new Functions(client);

// IDs para as collections e banco (necessários para o funcionamento do CRM)
export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "699f06a6001a11c21825";
export const LEADS_COL = import.meta.env.VITE_APPWRITE_LEADS_COLLECTION_ID || "699f10500032d0fd5b80";
export const ACADEMIES_COL = import.meta.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || "699f1068000e1b1ca1d2";
export const STOCK_ITEMS_COL = import.meta.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || "";
export const INVENTORY_MOVE_FN_ID = import.meta.env.VITE_APPWRITE_INVENTORY_MOVE_FN_ID || "";
export const SALES_CREATE_FN_ID = import.meta.env.VITE_APPWRITE_SALES_CREATE_FN_ID || "";
export const SALES_CANCEL_FN_ID = import.meta.env.VITE_APPWRITE_SALES_CANCEL_FN_ID || "";
export const INVENTORY_SEED_KIMONOS_FN_ID = import.meta.env.VITE_APPWRITE_INVENTORY_SEED_KIMONOS_FN_ID || "";

// Tamanhos padrão de kimono
export const KIMONO_SIZES = {
    adulto_unissex: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
    feminino: ['F0', 'F1', 'F2', 'F3', 'F4'],
    infantil: ['M00', 'M0', 'M1', 'M2', 'M3', 'M4']
};

console.log('🔌 Appwrite Config Loaded:');
console.log('   - Database:', DB_ID);
console.log('   - Leads Col:', LEADS_COL);
console.log('   - Academies Col:', ACADEMIES_COL);
console.log('   - Stock Items Col:', STOCK_ITEMS_COL || '(unset)');
console.log('   - Fn Inventory Move:', INVENTORY_MOVE_FN_ID || '(unset)');
console.log('   - Fn Sales Create:', SALES_CREATE_FN_ID || '(unset)');
console.log('   - Fn Sales Cancel:', SALES_CANCEL_FN_ID || '(unset)');
console.log('   - Fn Inventory Seed Kimonos:', INVENTORY_SEED_KIMONOS_FN_ID || '(unset)');

export { client, account, databases, functions };
export default client;
