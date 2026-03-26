import { account, client, ENDPOINT_FALLBACK, setClientEndpoint } from './appwrite';
import { ID } from 'appwrite';

export const authService = {
    _jwtTimer: null,
    _jwtKey: 'appwrite_jwt',
    _jwtExpKey: 'appwrite_jwt_exp',
    async _setJwtFromSession() {
        console.log('[Auth] _setJwtFromSession called. Requesting JWT from Appwrite...');
        try {
            const data = await account.createJWT();
            console.log('[Auth] JWT received successfully:', data ? 'Yes (hidden)' : 'No data');
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
        } catch (error) {
            console.error('[Auth] Failed to create JWT in _setJwtFromSession:', error);
            throw error;
        }
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
        console.log('[Auth] Attempting login for:', email);
        console.log('[Auth] Current Client Config:', {
            endpoint: client.config.endpoint,
            project: client.config.project
        });
        try {
            session = await account.createEmailPasswordSession(email, password);
            console.log('[Auth] Login successful (primary endpoint)', session);
        } catch (e) {
            console.error('[Auth] Error on primary login attempt:', e);
            const msg = String(e?.message || e);
            console.log('[Auth] Error message pattern check:', msg);
            if (ENDPOINT_FALLBACK && /fetch|cors|origin|failed/i.test(msg)) {
                console.warn(`[Auth] Fallback triggered! Switching endpoint to: ${ENDPOINT_FALLBACK}`);
                setClientEndpoint(ENDPOINT_FALLBACK);
                console.log('[Auth] Client config after fallback:', {
                    endpoint: client.config.endpoint,
                    project: client.config.project
                });
                try {
                    session = await account.createEmailPasswordSession(email, password);
                    console.log('[Auth] Login successful (fallback endpoint)', session);
                } catch (fallbackError) {
                    console.error('[Auth] Error on fallback login attempt:', fallbackError);
                    throw fallbackError;
                }
            } else {
                throw e;
            }
        }
        try {
            console.log('[Auth] Attempting to create JWT after successful login...');
            await this._setJwtFromSession();
            console.log('[Auth] JWT created successfully');
        } catch (jwtError) {
             console.error('[Auth] Error creating JWT after login:', jwtError);
             // Não jogamos erro aqui para não quebrar o fluxo caso a sessão já tenha sido criada,
             // mas logamos para entender onde está parando
        }
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
