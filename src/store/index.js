import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { configureAuthHandlers } from '@/services/axios';
import authReducer, { tokenRefreshed, sessionExpired, logout } from './authSlice';
import assetsReducer from './assetsSlice';
import employeesReducer from './employeesSlice';
import dashboardReducer from './dashboardSlice';
import categoriesReducer from './categoriesSlice';
import { currentAssignmentsReducer, handOverLogReducer } from './assignmentsSlice';

const appReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  assets: assetsReducer,
  employees: employeesReducer,
  categories: categoriesReducer,
  currentAssignments: currentAssignmentsReducer,
  handOverLog: handOverLogReducer,
});

// Drop all cached data when the session ends.
const rootReducer = (state, action) => {
  if (action.type === logout.fulfilled.type || action.type === sessionExpired.type) {
    return appReducer({ auth: state?.auth }, action);
  }
  return appReducer(state, action);
};

function makeStore() {
  const store = configureStore({ reducer: rootReducer });
  configureAuthHandlers({
    getToken: () => store.getState().auth.accessToken,
    onRefreshed: (session) => store.dispatch(tokenRefreshed(session)),
    onSessionExpired: () => store.dispatch(sessionExpired()),
  });
  return store;
}

let browserStore;

/**
 * One store per browser tab. The axios auth handlers are module-level, so creating a second
 * store (e.g. React Strict Mode double-invoking the useState initializer) would point the
 * interceptor at a store the app never renders, and requests would go out without a token.
 * On the server a fresh store is created per render.
 */
export function getStore() {
  if (typeof window === 'undefined') return makeStore();
  return (browserStore ??= makeStore());
}
