import axios from 'axios';

// The access token lives only in Redux memory; the refresh token is an httpOnly cookie.
// Nothing is written to localStorage / sessionStorage.
const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 20000 });

// Separate instance without interceptors so a failing refresh can't loop.
const refreshClient = axios.create({ baseURL: '/api', withCredentials: true, timeout: 20000 });

let handlers = {
  getToken: () => null,
  onRefreshed: () => {},
  onSessionExpired: () => {},
};

/** Wired up by the store to avoid a circular import between axios and the auth slice. */
export function configureAuthHandlers(next) {
  handlers = { ...handlers, ...next };
}

export const requestRefresh = () => refreshClient.post('/auth/refresh').then((res) => res.data);

api.interceptors.request.use((config) => {
  const token = handlers.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Concurrent 401s share one refresh request.
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 401 && code === 'TOKEN_EXPIRED' && original && !original._retry) {
      original._retry = true;
      try {
        refreshPromise ||= requestRefresh().finally(() => {
          refreshPromise = null;
        });
        const session = await refreshPromise;
        handlers.onRefreshed(session);
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return api(original);
      } catch (refreshError) {
        handlers.onSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    if (status === 401) handlers.onSessionExpired();
    return Promise.reject(error);
  }
);

export const isCancelled = (error) => axios.isCancel(error) || error?.name === 'CanceledError';

/** Turn any thrown value into a message a user can act on. */
export function getErrorMessage(error) {
  if (isCancelled(error)) return 'Request was cancelled';
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error?.response) {
    const { status } = error.response;
    if (status === 401) return 'Your session has expired. Please log in again.';
    if (status === 403) return 'You do not have permission to do this.';
    if (status === 404) return 'The requested item was not found.';
    if (status >= 500) return 'Something went wrong on the server. Please try again.';
  }
  if (error?.request || error?.message === 'Network Error') {
    return 'Unable to reach the server. Check your connection and try again.';
  }
  return error?.message || 'Something went wrong';
}

/**
 * Normalised error object used as the rejection payload of every thunk.
 * `code`: the server's reason code when it gave one (e.g. "CONFLICT", "DB_UNAVAILABLE"), else
 * "TIMEOUT" / "NETWORK" when no answer came back — i.e. we don't know whether the server acted.
 */
export function toApiError(error) {
  const noAnswer = !error?.response && !isCancelled(error);
  return {
    message: getErrorMessage(error),
    status: error?.response?.status ?? null,
    fields: error?.response?.data?.fields ?? null,
    code:
      error?.response?.data?.code ??
      (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : noAnswer ? 'NETWORK' : null),
  };
}

/** True when the request may have reached the server but no answer came back (timeout / dropped connection). */
export const isOutcomeUnknown = (apiError) => apiError?.code === 'TIMEOUT' || apiError?.code === 'NETWORK';

export default api;
