/** IDs de coleções Appwrite (server / scripts). */

export const DB_ID =
  process.env.VITE_APPWRITE_DATABASE_ID ||
  process.env.APPWRITE_DATABASE_ID ||
  process.env.DB_ID ||
  '';

export const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID ||
  process.env.APPWRITE_LEADS_COLLECTION_ID ||
  '';

export const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
  process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
  '';

export const LEAD_EVENTS_COL =
  process.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  '';

export const STUDENT_PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
