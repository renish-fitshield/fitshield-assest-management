import { createSlice } from '@reduxjs/toolkit';
import api from '@/services/axios';
import { apiThunk } from './apiThunk';
import { addListCases, addMutationCases, listInitialState } from './listState';
import { SORT_DATA } from './listPayload';

// Body: { filter, pagination_info, sort } — see store/listPayload.js
export const fetchAssets = apiThunk('assets/fetch', (body, { signal }) => api.post('/assets/list', body, { signal }));
export const fetchAssetById = apiThunk('assets/fetchOne', (id, { signal }) => api.get(`/assets/${id}`, { signal }));
export const createAsset = apiThunk('assets/create', (payload) => api.post('/assets', payload));
export const updateAsset = apiThunk('assets/update', ({ id, data }) => api.put(`/assets/${id}`, data));
export const deleteAsset = apiThunk('assets/delete', (id) => api.delete(`/assets/${id}`));

// Assignment: one asset → one employee. Body: { employeeId, assignedAt?, notes? }
export const assignAsset = apiThunk('assets/assign', ({ id, data }) => api.post(`/assets/${id}/assign`, data));
// Body: { returnedAt?, condition?, statusAfter?, notes? }
export const returnAsset = apiThunk('assets/return', ({ id, data }) => api.post(`/assets/${id}/return`, data));
export const fetchAssetAssignments = apiThunk('assets/assignments', (id, { signal }) =>
  api.get(`/assets/${id}/assignments`, { signal })
);
/** Available assets for the "assign to employee" picker (server-side search, same list API). */
export const searchAssignableAssets = apiThunk('assets/searchAssignable', (searchText, { signal }) =>
  api.post(
    '/assets/list',
    {
      filter: { status: 'Available', ...(searchText ? { searchText } : {}) },
      pagination_info: { page: 1, perPageData: 20 },
      sort: { sortBy: 'assetId', data: SORT_DATA.ASC },
    },
    { signal }
  )
);

// Images (multipart upload; JPEG/PNG/WebP ≤ 2 MB)
export const uploadAssetImage = apiThunk('assets/uploadImage', ({ id, file }) => {
  const form = new FormData();
  form.append('image', file);
  return api.post(`/assets/${id}/image`, form);
});
export const deleteAssetImage = apiThunk('assets/deleteImage', (id) => api.delete(`/assets/${id}/image`));

export const ASSET_FILTER_KEYS = ['assignedTo', 'category', 'status', 'condition', 'warrantyStatus'];

export const ASSET_DEFAULT_QUERY = {
  page: 1,
  perPageData: 10,
  sortBy: null,
  sortData: SORT_DATA.DEFAULT,
  searchText: '',
  assignedTo: null,
  category: null,
  status: null,
  condition: null,
  warrantyStatus: null,
};

const assetsSlice = createSlice({
  name: 'assets',
  initialState: listInitialState(ASSET_DEFAULT_QUERY),
  reducers: {
    setAssetQuery: (state, { payload }) => {
      state.query = { ...state.query, ...payload };
    },
    resetAssetFilters: (state) => {
      state.query = { ...ASSET_DEFAULT_QUERY, perPageData: state.query.perPageData };
    },
  },
  extraReducers: (builder) => {
    addListCases(builder, fetchAssets);
    addMutationCases(builder, [createAsset, updateAsset, deleteAsset, assignAsset, returnAsset]);
  },
});

export const { setAssetQuery, resetAssetFilters } = assetsSlice.actions;
export default assetsSlice.reducer;
