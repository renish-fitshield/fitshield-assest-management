import { createSlice } from '@reduxjs/toolkit';
import api from '@/services/axios';
import { apiThunk, isAbortedAction } from './apiThunk';

// Body: { filter: { searchText, ...filters } }
export const fetchDashboard = apiThunk('dashboard/fetch', (body, { signal }) =>
  api.post('/dashboard', body, { signal })
);

export const DASHBOARD_FILTER_KEYS = [
  'categoryId',
  'status',
  'condition',
  'warrantyStatus',
  'purchaseType',
  'location',
  'purchasedFrom',
  'purchasedTo',
];

export const EMPTY_DASHBOARD_FILTERS = {
  searchText: '',
  categoryId: null,
  status: null,
  condition: null,
  warrantyStatus: null,
  purchaseType: null,
  location: null,
  purchasedFrom: null,
  purchasedTo: null,
};

const initialState = {
  data: null,
  filters: EMPTY_DASHBOARD_FILTERS,
  loading: false,
  requestId: null,
  error: null,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setDashboardFilters: (state, { payload }) => {
      state.filters = { ...state.filters, ...payload };
    },
    resetDashboardFilters: (state) => {
      state.filters = EMPTY_DASHBOARD_FILTERS;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state, { meta }) => {
        state.loading = true;
        state.error = null;
        state.requestId = meta.requestId;
      })
      .addCase(fetchDashboard.fulfilled, (state, { payload, meta }) => {
        if (state.requestId !== meta.requestId) return;
        state.loading = false;
        state.requestId = null;
        state.data = payload;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId || isAbortedAction(action)) return;
        state.loading = false;
        state.requestId = null;
        state.error = action.payload?.message || 'Failed to load dashboard';
      });
  },
});

export const { setDashboardFilters, resetDashboardFilters } = dashboardSlice.actions;
export default dashboardSlice.reducer;
