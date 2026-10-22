import { createAsyncThunk } from '@reduxjs/toolkit';
import { toApiError } from '@/services/axios';

/**
 * createAsyncThunk wrapper.
 * - `request(arg, { signal })` receives the thunk's AbortSignal, so `promise.abort()` cancels the HTTP call.
 * - Resolves with the response body; rejects with `{ message, status, fields }`.
 * - Use `await dispatch(thunk(arg)).unwrap()` inside try/catch in components.
 */
export const apiThunk = (type, request) =>
  createAsyncThunk(type, async (arg, { rejectWithValue, signal }) => {
    try {
      const { data } = await request(arg, { signal });
      return data;
    } catch (err) {
      return rejectWithValue(toApiError(err));
    }
  });

/** True when a rejected action came from an aborted (superseded) request — not a real failure. */
export const isAbortedAction = (action) => Boolean(action?.meta?.aborted);
