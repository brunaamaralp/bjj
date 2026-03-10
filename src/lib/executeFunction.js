import { functions } from './appwrite';

export async function callFunction(functionId, payload) {
  if (!functionId) {
    throw new Error('function_id_missing');
  }
  const exec = await functions.createExecution(functionId, JSON.stringify(payload || {}), false);
  const code = exec.responseStatusCode || 200;
  let body = {};
  try {
    body = JSON.parse(exec.responseBody || '{}');
  } catch {
    body = { raw: exec.responseBody };
  }
  if (code >= 400) {
    throw new Error(body.error || `error_${code}`);
  }
  return body;
}

