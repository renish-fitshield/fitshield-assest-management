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
/** Brand suggestions: built-in list + brands users have added (→ { items: [name] }). */
export const fetchBrandOptions = apiThunk('assets/brands', (_, { signal }) => api.get('/brands', { signal }));

// Hand-overs also send email, which can be slow; wait longer than the default before giving up,
// so a hand-over that went through isn't reported as failed. (The server allows up to 60s.)
const HAND_OVER_TIMEOUT = { timeout: 75_000 };

// Assignment: one asset → one employee at a time. Each call records history + activity on the asset.
// Body: { employeeId, assignedAt?, condition?, expectedReturnAt?, notes? }
export const assignAsset = apiThunk('assets/assign', ({ id, data }) => api.post(`/assets/${id}/assign`, data, HAND_OVER_TIMEOUT));
// Straight to another employee. Body: { employeeId, transferredAt?, condition?, expectedReturnAt?, notes? }
export const transferAsset = apiThunk('assets/transfer', ({ id, data }) =>
  api.post(`/assets/${id}/transfer`, data, HAND_OVER_TIMEOUT)
);
// Body: { returnedAt?, condition?, statusAfter?, notes? }
export const returnAsset = apiThunk('assets/return', ({ id, data }) => api.post(`/assets/${id}/return`, data, HAND_OVER_TIMEOUT));
/** → { assignmentHistory, activities, createdAt } — newest first. */
export const fetchAssetHistory = apiThunk('assets/history', (id, { signal }) =>
  api.get(`/assets/${id}/history`, { signal })
);
/** Several assets to one employee. Body: { employeeId, assetIds, assignedAt?, expectedReturnAt?, notes? } */
export const assignManyAssets = apiThunk('assets/assignMany', (data) => api.post('/assignments', data, HAND_OVER_TIMEOUT));
/** Send a hand-over's acknowledgement email again. → { email, message } */
export const resendAckEmail = apiThunk('assets/resendAckEmail', ({ id, eventId, side }) =>
  api.post(`/assets/${id}/acknowledgement-email`, { eventId, side }, HAND_OVER_TIMEOUT)
);
/** Every hand-over across assets. Body: { filter, pagination_info } */
export const fetchAssignmentLog = apiThunk('assets/assignmentLog', (body, { signal }) =>
  api.post('/assignments/log', body, { signal })
);
export const fetchAssignmentSummary = apiThunk('assets/assignmentSummary', (_, { signal }) =>
  api.get('/assignments/summary', { signal })
);
/** Assets that can be assigned (Available, quantity 1) for the "assign to employee" picker. */
export const searchAssignableAssets = apiThunk('assets/searchAssignable', (searchText, { signal }) =>
  api.post(
    '/assets/list',
    {
      filter: { assignable: 'true', ...(searchText ? { searchText } : {}) },
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

export const ASSET_FILTER_KEYS = ['assignedTo', 'categoryId', 'status', 'condition', 'warrantyStatus', 'returnDue'];

export const ASSET_DEFAULT_QUERY = {
  page: 1,
  perPageData: 10,
  sortBy: null,
  sortData: SORT_DATA.DEFAULT,
  searchText: '',
  assignedTo: null,
  categoryId: null,
  status: null,
  condition: null,
  warrantyStatus: null,
  returnDue: null,
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
    addMutationCases(builder, [createAsset, updateAsset, deleteAsset, assignAsset, transferAsset, returnAsset, assignManyAssets]);
  },
});

export const { setAssetQuery, resetAssetFilters } = assetsSlice.actions;
export default assetsSlice.reducer;
