import { Client, Databases, ID } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.APPWRITE_PROJECT_ID || "SEU_PROJECT_ID")
  .setKey(process.env.APPWRITE_API_KEY || "SUA_API_KEY");

const databases = new Databases(client);

const DB_ID = process.env.APPWRITE_DATABASE_ID || "bjj_manager";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createDatabase() {
  console.log("✅ Database criado");
}

async function createCollection(id, name) {
  await databases.createCollection(DB_ID, id, name);
  console.log(`✅ Collection ${name} criada`);
}

async function run() {
  await createDatabase();

  await createCollection("leads", "Leads");
  await sleep(1000);

  await databases.createStringAttribute(DB_ID, "leads", "name", 255, true);
  await databases.createStringAttribute(DB_ID, "leads", "phone", 50, false);
  await databases.createStringAttribute(DB_ID, "leads", "status", 50, false);
  await databases.createStringAttribute(DB_ID, "leads", "academyId", 50, true);

  console.log("✅ Leads configurado");

  await createCollection("academies", "Academies");
  await sleep(1000);

  await databases.createStringAttribute(DB_ID, "academies", "ownerId", 50, true);
  await databases.createStringAttribute(DB_ID, "academies", "name", 255, true);
  await databases.createStringAttribute(DB_ID, "academies", "phone", 50, false);

  console.log("✅ Academies configurado");

  await createCollection("classes", "Classes");
  await sleep(1000);

  await databases.createStringAttribute(DB_ID, "classes", "academyId", 50, true);
  await databases.createStringAttribute(DB_ID, "classes", "name", 100, true);
  await databases.createStringAttribute(DB_ID, "classes", "time", 10, true);

  console.log("✅ Classes configurado");

  console.log("🎉 Setup finalizado!");
}

run().catch((e) => {
  console.error("Erro:", e && e.message ? e.message : e);
  process.exit(1);
});

