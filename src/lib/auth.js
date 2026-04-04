import { account, client } from './appwrite';
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
        const session = await account.createEmailPasswordSession(email, password);
        if (import.meta.env.DEV) {
            console.log('[Auth] Login successful');
        }
        return session;
    },

    async register(email, password, name) {
        await account.create(ID.unique(), email, password, name);
        return await this.login(email, password);
    },

    async getCurrentUser() {
        try {
            return await account.get();
        } catch {
            return null;
        }
    },

    async logout() {
        try {
            await account.deleteSession('current');
        } catch (e) {
            void e;
        }
    },

    // Mantido apenas para não quebrar referências no App.jsx
    async refreshJwt() {
        return null;
    }
};
