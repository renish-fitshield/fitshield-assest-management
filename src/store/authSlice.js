import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { requestRefresh, toApiError } from '@/services/axios';

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    return data;
  } catch (err) {
    return rejectWithValue(toApiError(err));
  }
});

const RESTORE_RETRY_DELAYS_MS = [800, 2000];
const isTransient = (e) => e.status === null || e.status >= 500; // network error / server or DB hiccup
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Called on app load / page refresh: trades the httpOnly refresh cookie for an access token.
// Temporary failures are retried before the "Couldn't connect" screen is shown.
export const restoreSession = createAsyncThunk(
  'auth/restore',
  async (_, { rejectWithValue }) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestRefresh();
      } catch (err) {
        const apiError = toApiError(err);
        if (!isTransient(apiError) || attempt >= RESTORE_RETRY_DELAYS_MS.length) {
          return rejectWithValue(apiError);
        }
        await wait(RESTORE_RETRY_DELAYS_MS[attempt]);
      }
    }
  },
  // Ignore duplicate calls while one is in flight (e.g. React Strict Mode running effects twice).
  { condition: (_, { getState }) => getState().auth.status !== 'loading' }
);

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } catch {
    // Clearing local state is what matters; ignore network errors.
  }
});

const initialState = {
  user: null,
  accessToken: null,
  // 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'expired' | 'restoreFailed'
  status: 'idle',
  error: null,
};

const applySession = (state, { payload }) => {
  state.user = payload.user;
  state.accessToken = payload.accessToken;
  state.status = 'authenticated';
  state.error = null;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    tokenRefreshed: applySession,
    clearAuthError: (state) => {
      state.error = null;
    },
    sessionExpired: (state) => {
      if (state.status !== 'authenticated') return;
      Object.assign(state, initialState, { status: 'expired' });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, applySession)
      .addCase(login.rejected, (state, { payload, error }) => {
        state.status = 'unauthenticated';
        state.error = payload?.message || error?.message || 'Login failed';
      })
      .addCase(restoreSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(restoreSession.fulfilled, applySession)
      .addCase(restoreSession.rejected, (state, { payload }) => {
        // 401 = no/expired session → log in again. Anything else (network, 5xx) is retryable.
        if (payload?.status === 401) {
          Object.assign(state, initialState, { status: 'unauthenticated' });
        } else {
          state.status = 'restoreFailed';
          state.error = payload?.message || 'Could not restore your session';
        }
      })
      .addCase(logout.fulfilled, (state) => {
        Object.assign(state, initialState, { status: 'unauthenticated' });
      });
  },
});

export const { tokenRefreshed, sessionExpired, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
