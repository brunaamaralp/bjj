import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

async function checkIndices() {
    try {
        const dbId = process.env.VITE_APPWRITE_DATABASE_ID;
        const colId = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID;
        console.log('Checking indices for collection:', colId);
        
        const col = await databases.getCollection(dbId, colId);
        console.log('Indices found:');
        col.indexes.forEach(idx => {
            console.log(`- ${idx.key}: ${idx.type} [${idx.attributes.join(', ')}]`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkIndices();
