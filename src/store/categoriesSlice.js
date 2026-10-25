import { createSlice } from '@reduxjs/toolkit';
import api from '@/services/axios';
import { apiThunk, isAbortedAction } from './apiThunk';
import { addMutationCases } from './listState';

/** → { items: [{ _id, name, assetCount, createdAt, updatedAt }] }, A→Z. Small list, so no paging. */
export const fetchCategories = apiThunk('categories/fetch', (_, { signal }) => api.get('/categories', { signal }));
export const createCategory = apiThunk('categories/create', (payload) => api.post('/categories', payload));
// No delete: categories can only be added and renamed.
export const updateCategory = apiThunk('categories/update', ({ id, data }) => api.put(`/categories/${id}`, data));

const categoriesSlice = createSlice({
  name: 'categories',
  initialState: { items: [], loading: false, loaded: false, requestId: null, saving: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state, { meta }) => {
        state.loading = true;
        state.error = null;
        state.requestId = meta.requestId;
      })
      .addCase(fetchCategories.fulfilled, (state, { payload, meta }) => {
        if (state.requestId !== meta.requestId) return;
        state.loading = false;
        state.requestId = null;
        state.loaded = true;
        state.items = payload.items;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId || isAbortedAction(action)) return;
        state.loading = false;
        state.requestId = null;
        state.error = action.payload?.message || 'Failed to load categories';
      });
    addMutationCases(builder, [createCategory, updateCategory]);
  },
});

export default categoriesSlice.reducer;
