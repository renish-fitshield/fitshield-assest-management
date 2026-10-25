import { createSlice } from '@reduxjs/toolkit';
import api from '@/services/axios';
import { apiThunk, isAbortedAction } from './apiThunk';
import { addListCases, addMutationCases, listInitialState } from './listState';
import { SORT_DATA } from './listPayload';

// Body: { filter, pagination_info, sort } — see store/listPayload.js
export const fetchEmployees = apiThunk('employees/fetch', (body, { signal }) =>
  api.post('/employees/list', body, { signal })
);
export const fetchEmployeeById = apiThunk('employees/fetchOne', (id, { signal }) =>
  api.get(`/employees/${id}`, { signal })
);
export const fetchEmployeeOptions = apiThunk('employees/options', (_, { signal }) =>
  api.get('/employees/options', { signal })
);
/** → { employee, current: [assets held now], history: [assignments] } */
export const fetchEmployeeAssets = apiThunk('employees/assets', (id, { signal }) =>
  api.get(`/employees/${id}/assets`, { signal })
);
export const createEmployee = apiThunk('employees/create', (payload) => api.post('/employees', payload));
export const updateEmployee = apiThunk('employees/update', ({ id, data }) => api.put(`/employees/${id}`, data));
export const deleteEmployee = apiThunk('employees/delete', (id) => api.delete(`/employees/${id}`));

export const EMPLOYEE_FILTER_KEYS = ['department', 'status', 'workType', 'employmentType'];

export const EMPLOYEE_DEFAULT_QUERY = {
  page: 1,
  perPageData: 10,
  sortBy: null,
  sortData: SORT_DATA.DEFAULT,
  searchText: '',
  department: null,
  status: null,
  workType: null,
  employmentType: null,
};

const employeesSlice = createSlice({
  name: 'employees',
  initialState: {
    ...listInitialState(EMPLOYEE_DEFAULT_QUERY),
    options: [],
    optionsLoading: false,
    optionsError: null,
  },
  reducers: {
    setEmployeeQuery: (state, { payload }) => {
      state.query = { ...state.query, ...payload };
    },
    resetEmployeeFilters: (state) => {
      state.query = { ...EMPLOYEE_DEFAULT_QUERY, perPageData: state.query.perPageData };
    },
  },
  extraReducers: (builder) => {
    addListCases(builder, fetchEmployees);
    addMutationCases(builder, [createEmployee, updateEmployee, deleteEmployee]);
    builder
      .addCase(fetchEmployeeOptions.pending, (state) => {
        state.optionsLoading = true;
        state.optionsError = null;
      })
      .addCase(fetchEmployeeOptions.fulfilled, (state, { payload }) => {
        state.optionsLoading = false;
        state.options = payload.items;
      })
      .addCase(fetchEmployeeOptions.rejected, (state, action) => {
        if (isAbortedAction(action)) return;
        state.optionsLoading = false;
        state.optionsError = action.payload?.message || 'Failed to load employees';
      });
  },
});

export const { setEmployeeQuery, resetEmployeeFilters } = employeesSlice.actions;
export default employeesSlice.reducer;
