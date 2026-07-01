import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
  },
  DB_ID: 'db-test',
  ACADEMIES_COL: 'academies',
}));

import {
  encryptPagbankToken,
  encryptPagbankWebhookSecret,
} from '../pagbankCrypto.js';
import { readPagbankSecretsFromAcademyDoc } from '../pagbankCredentialsFromDoc.js';
import {
  getPagbankCredentials,
  getPagbankWebhookSecret,
} from '../getPagbankCredentials.js';
import { readPagbankConfig } from '../../pagbankSettings.js';

const TEST_KEY = 'pagbank-test-encryption-key-32chars!!';

function academyDocWithSecrets({ token = 'tok_plain', webhookSecret = 'whsec_plain' } = {}) {
  const settings = JSON.stringify({
    pagbank: {
      token_encrypted: encryptPagbankToken(token),
      webhook_secret_encrypted: encryptPagbankWebhookSecret(webhookSecret),
    },
  });
  return { settings };
}

describe('readPagbankSecretsFromAcademyDoc', () => {
  beforeEach(() => {
    process.env.PAGBANK_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
  });

  it('decrypts encrypted fields from academy settings', () => {
    const doc = academyDocWithSecrets();
    expect(readPagbankSecretsFromAcademyDoc(doc)).toEqual({
      token: 'tok_plain',
      webhookSecret: 'whsec_plain',
    });
  });

  it('ignores legacy plain-text top-level fields', () => {
    const doc = {
      pagbank_token: 'legacy_tok',
      pagbank_webhook_secret: 'legacy_whsec',
      settings: '{}',
    };
    expect(readPagbankSecretsFromAcademyDoc(doc)).toEqual({
      token: '',
      webhookSecret: '',
    });
  });
});

describe('readPagbankConfig', () => {
  it('reads nested pagbank config from settings JSON string', () => {
    const settings = JSON.stringify({
      pagbank: { token_encrypted: 'enc', webhook_secret_encrypted: 'wh' },
    });
    expect(readPagbankConfig(settings)).toEqual({
      token_encrypted: 'enc',
      webhook_secret_encrypted: 'wh',
    });
  });
});

describe('getPagbankCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAGBANK_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
  });

  it('returns decrypted token and webhook secret', async () => {
    mocks.getDocument.mockResolvedValue({
      pagbank_enabled: true,
      pagbank_public_key: 'pk_test',
      ...academyDocWithSecrets({ token: 'tok_api', webhookSecret: 'whsec_api' }),
    });

    const creds = await getPagbankCredentials('ac-1');
    expect(creds).toEqual({
      token: 'tok_api',
      publicKey: 'pk_test',
      webhookSecret: 'whsec_api',
    });
  });

  it('throws pagbank_token_missing when encrypted token absent', async () => {
    mocks.getDocument.mockResolvedValue({
      pagbank_enabled: true,
      settings: JSON.stringify({ pagbank: { token_encrypted: '' } }),
    });

    await expect(getPagbankCredentials('ac-1')).rejects.toThrow('pagbank_token_missing');
  });

  it('throws pagbank_not_enabled when disabled', async () => {
    mocks.getDocument.mockResolvedValue({
      pagbank_enabled: false,
      ...academyDocWithSecrets({ token: 'tok' }),
    });

    await expect(getPagbankCredentials('ac-1')).rejects.toThrow('pagbank_not_enabled');
  });
});

describe('getPagbankWebhookSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAGBANK_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
  });

  it('returns decrypted webhook secret without requiring enabled flag', async () => {
    mocks.getDocument.mockResolvedValue({
      pagbank_enabled: false,
      ...academyDocWithSecrets({ webhookSecret: 'whsec_only' }),
    });

    await expect(getPagbankWebhookSecret('ac-1')).resolves.toBe('whsec_only');
  });
});
