import { account, client, clearSessionJwtCache } from './appwrite';
import { ID } from 'appwrite';

export const authService = {
    async login(email, password) {
        if (import.meta.env.DEV) {
            console.log('[Auth] Attempting login');
            console.log('[Auth] Current Client Config:', {
                endpoint: client.config.endpoint,
                project: client.config.project
            });
        }
        clearSessionJwtCache();
        const session = await account.createEmailPasswordSession(email, password);
        if (import.meta.env.DEV) {
            console.log('[Auth] Login successful');
        }
        return session;
    },

    async register(email, password, name, legalAcceptance) {
        await account.create(ID.unique(), email, password, name);
        const session = await this.login(email, password);
        if (legalAcceptance && typeof legalAcceptance === 'object') {
            try {
                await account.updatePrefs({
                    legal_terms_version: String(legalAcceptance.termsVersion || ''),
                    legal_privacy_version: String(legalAcceptance.privacyVersion || ''),
                    legal_accepted_at: String(legalAcceptance.acceptedAt || new Date().toISOString()),
                });
            } catch (e) {
                console.error('[Auth] Falha ao gravar aceite legal:', e);
                throw new Error('Conta criada, mas não foi possível registrar o aceite dos termos. Tente entrar novamente ou fale com o suporte.');
            }
        }
        return session;
    },

    async getCurrentUser() {
        try {
            return await account.get();
        } catch {
            return null;
        }
    },

    async logout() {
        clearSessionJwtCache();
        try {
            await account.deleteSession('current');
        } catch (e) {
            void e;
        }
    },

    async updatePassword(newPassword, oldPassword) {
        return await account.updatePassword(newPassword, oldPassword);
    },

    // Mantido apenas para não quebrar referências no App.jsx
    async refreshJwt() {
        return null;
    }
};
