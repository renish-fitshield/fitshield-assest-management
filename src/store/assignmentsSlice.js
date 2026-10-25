import { createSlice } from '@reduxjs/toolkit';
import api from '@/services/axios';
import { apiThunk } from './apiThunk';
import { addListCases, listInitialState } from './listState';
import { SORT_DATA } from './listPayload';

// Assignments page: who holds what right now, and every hand-over ever made.

/** Assets someone holds right now (the asset list, always filtered to assigned). */
export const fetchCurrentAssignments = apiThunk('assignments/current', (body, { signal }) =>
  api.post('/assets/list', { ...body, filter: { ...body.filter, assigned: 'true' } }, { signal })
);
export const CURRENT_FILTER_KEYS = ['assignedTo', 'acknowledgement', 'returnDue', 'categoryId'];
export const CURRENT_DEFAULT_QUERY = {
  page: 1,
  perPageData: 10,
  sortBy: null,
  sortData: SORT_DATA.DEFAULT,
  searchText: '',
  assignedTo: null,
  acknowledgement: null,
  returnDue: null,
  categoryId: null,
};

/** Every hand-over across all assets, newest first (POST /api/assignments/log). */
export const fetchHandOverLog = apiThunk('assignments/log', (body, { signal }) => api.post('/assignments/log', body, { signal }));
export const LOG_FILTER_KEYS = ['action', 'employeeId', 'acknowledgement'];
export const LOG_DEFAULT_QUERY = {
  page: 1,
  perPageData: 20,
  sortBy: null,
  sortData: SORT_DATA.DEFAULT,
  searchText: '',
  action: null,
  employeeId: null,
  acknowledgement: null,
};

const listSlice = (name, fetchThunk, defaultQuery) =>
  createSlice({
    name,
    initialState: listInitialState(defaultQuery),
    reducers: {
      setQuery: (state, { payload }) => {
        state.query = { ...state.query, ...payload };
      },
      resetFilters: (state) => {
        state.query = { ...defaultQuery, perPageData: state.query.perPageData };
      },
    },
    extraReducers: (builder) => addListCases(builder, fetchThunk),
  });

const currentSlice = listSlice('currentAssignments', fetchCurrentAssignments, CURRENT_DEFAULT_QUERY);
const logSlice = listSlice('handOverLog', fetchHandOverLog, LOG_DEFAULT_QUERY);

export const { setQuery: setCurrentQuery, resetFilters: resetCurrentFilters } = currentSlice.actions;
export const { setQuery: setLogQuery, resetFilters: resetLogFilters } = logSlice.actions;
export const currentAssignmentsReducer = currentSlice.reducer;
export const handOverLogReducer = logSlice.reducer;
