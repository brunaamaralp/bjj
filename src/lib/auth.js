import { account, client, ENDPOINT_FALLBACK, setClientEndpoint } from './appwrite';
import { ID } from 'appwrite';

export const authService = {
    _jwtTimer: null,
    _jwtKey: 'appwrite_jwt',
    _jwtExpKey: 'appwrite_jwt_exp',
    async _setJwtFromSession() {
        const data = await account.createJWT();
        const exp = Date.now() + 14 * 60 * 1000;
        client.setJWT(data.jwt);
        try {
            localStorage.setItem(this._jwtKey, data.jwt);
            localStorage.setItem(this._jwtExpKey, String(exp));
        } catch (e) { void e; }
        if (this._jwtTimer) clearTimeout(this._jwtTimer);
        this._jwtTimer = setTimeout(() => {
            this.refreshJwt().catch(() => {});
        }, 10 * 60 * 1000);
        return data.jwt;
    },
    async refreshJwt() {
        try {
            return await this._setJwtFromSession();
        } catch {
            return null;
        }
    },
    _loadJwtFromStorage() {
        try {
            const jwt = localStorage.getItem(this._jwtKey) || '';
            const exp = parseInt(localStorage.getItem(this._jwtExpKey) || '0', 10);
            if (jwt && Number.isFinite(exp) && Date.now() < exp) {
                client.setJWT(jwt);
                return true;
            }
        } catch (e) { void e; }
        return false;
    },
    async login(email, password) {
        let session;
        try {
            session = await account.createEmailPasswordSession(email, password);
        } catch (e) {
            const msg = String(e?.message || e);
            if (ENDPOINT_FALLBACK && /fetch|cors|origin|failed/i.test(msg)) {
                setClientEndpoint(ENDPOINT_FALLBACK);
                session = await account.createEmailPasswordSession(email, password);
            } else {
                throw e;
            }
        }
        await this._setJwtFromSession();
        return session;
    },

    async register(email, password, name) {
        await account.create(ID.unique(), email, password, name);
        return await this.login(email, password);
    },

    async getCurrentUser() {
        try {
            if (!this._loadJwtFromStorage()) {
                try {
                    await this._setJwtFromSession();
                } catch (e) { void e; }
            }
            return await account.get();
        } catch {
            return null;
        }
    },

    async logout() {
        await account.deleteSession('current');
        client.setJWT('');
        try {
            localStorage.removeItem(this._jwtKey);
            localStorage.removeItem(this._jwtExpKey);
        } catch (e) { void e; }
        if (this._jwtTimer) clearTimeout(this._jwtTimer);
        this._jwtTimer = null;
    },
};
