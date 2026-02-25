import { account } from './appwrite';
import { ID } from 'appwrite';

export const authService = {
    async login(email, password) {
        return await account.createEmailPasswordSession(email, password);
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
        await account.deleteSession('current');
    },
};
