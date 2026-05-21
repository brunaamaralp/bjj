/** @param {Record<string, unknown>} [overrides] */
export function createMockRes(overrides = {}) {
  const state = { statusCode: 200, body: null, headers: {}, ended: false, ...overrides };
  const res = {
    statusCode: state.statusCode,
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(payload) {
      state.body = payload;
      state.ended = true;
      return res;
    },
    setHeader(k, v) {
      state.headers[k] = v;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
    send() {
      state.ended = true;
      return res;
    }
  };
  return { res, state };
}

/** @param {Record<string, unknown>} [overrides] */
export function createMockReq(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    query: {},
    body: {},
    ...overrides
  };
}
