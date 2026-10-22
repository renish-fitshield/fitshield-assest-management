import { isAbortedAction } from './apiThunk';

/**
 * Shared reducers for a server-paginated list. Only the latest request may write results,
 * so a slow response for an old search/filter can never overwrite a newer one.
 *
 * Response shape: { items, filter, pagination_info: { page, nextPage, perPageData, totalPages }, sort, totalCount }
 */
export function addListCases(builder, fetchThunk) {
  builder
    .addCase(fetchThunk.pending, (state, { meta }) => {
      state.loading = true;
      state.error = null;
      state.requestId = meta.requestId;
    })
    .addCase(fetchThunk.fulfilled, (state, { payload, meta }) => {
      if (state.requestId !== meta.requestId) return;
      const info = payload.pagination_info;
      state.loading = false;
      state.requestId = null;
      state.items = payload.items;
      state.totalCount = payload.totalCount;
      state.totalPages = info.totalPages;
      state.nextPage = info.nextPage;
      state.loaded = true;
      // Server clamps out-of-range pages (e.g. after deleting the last row of the last page).
      if (info.page !== state.query.page) state.query.page = info.page;
    })
    .addCase(fetchThunk.rejected, (state, action) => {
      if (state.requestId !== action.meta.requestId || isAbortedAction(action)) return;
      state.loading = false;
      state.requestId = null;
      state.error = action.payload?.message || action.error?.message || 'Failed to load data';
    });
}

/** Tracks in-flight create/update/delete so buttons can show a spinner. */
export function addMutationCases(builder, thunks) {
  for (const thunk of thunks) {
    builder
      .addCase(thunk.pending, (state) => {
        state.saving = true;
      })
      .addCase(thunk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(thunk.rejected, (state) => {
        state.saving = false;
      });
  }
}

export const listInitialState = (query) => ({
  items: [],
  totalCount: 0,
  totalPages: 1,
  nextPage: null,
  query,
  loading: false,
  loaded: false,
  requestId: null,
  saving: false,
  error: null,
});
