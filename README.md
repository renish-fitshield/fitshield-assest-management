# FitShield Asset Management

Full-stack Next.js 15 (App Router) app for managing company assets and employees. Used by Admin, CTO and HR.

- **Frontend:** React 19, Ant Design 5, Redux Toolkit + thunks, Axios with interceptors
- **Backend:** Next.js Route Handlers, MongoDB (Mongoose), JWT auth (jose) enforced by `src/middleware.js`

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in values (already present locally)
npm run seed                 # creates/resets the login user
npm run dev                  # http://localhost:3000
```

Test login: **jg@yopmail.com** / PIN **4545**

## Database

Everything lives in a dedicated database (`MONGODB_DB`, default `fitshield_asset_management`), so existing databases are untouched:

| Collection     | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `am_users`     | Login users (email, bcrypt-hashed PIN, role)     |
| `am_assets`    | Assets (`assetId` auto-generated `AST-0001`)     |
| `am_employees` | Employees (`employeeId` auto-generated `EMP-0001`) |
| `am_counters`  | Sequences for the human-readable IDs             |

## Auth flow

1. `POST /api/auth/login` checks the email and 4-digit PIN. It returns a short-lived **access token** in the response body and sets a **refresh token** as an `httpOnly` cookie.
2. The access token is kept **only in Redux memory**. Nothing goes in localStorage or sessionStorage.
3. The Axios request interceptor attaches `Authorization: Bearer <token>`.
4. `src/middleware.js` verifies the token on every `/api/*` route except the public ones (`login`, `refresh`, `logout`). An expired token gets `401 { code: "TOKEN_EXPIRED" }`.
5. The Axios response interceptor catches `TOKEN_EXPIRED`, calls `POST /api/auth/refresh` once (concurrent requests share that call) and retries the original request.
6. When the refresh cookie expires (`REFRESH_TOKEN_TTL_SECONDS`, 8h by default), the user is sent to `/login` with a "session expired" message.
7. After 5 wrong PINs the account is locked for 15 minutes.

Page routes (`/assets`, `/people`) are also guarded by middleware using the refresh cookie.

## API

All routes need `Authorization: Bearer <accessToken>` unless marked public.

| Method          | Route                       | Notes                                                    |
| --------------- | --------------------------- | -------------------------------------------------------- |
| POST            | `/api/auth/login`           | public                                                   |
| POST            | `/api/auth/refresh`         | public (uses cookie)                                     |
| POST            | `/api/auth/logout`          | public (clears cookie)                                   |
| GET             | `/api/auth/me`              | current user                                             |
| POST            | `/api/dashboard`            | dashboard metrics; body `{ filter }`                     |
| POST            | `/api/assets/list`          | list assets (body below)                                 |
| POST            | `/api/assets`               | create asset                                             |
| GET / PUT / DELETE | `/api/assets/:id`        |                                                          |
| POST            | `/api/employees/list`       | list employees (body below)                              |
| POST            | `/api/employees`            | create employee                                          |
| GET / PUT / DELETE | `/api/employees/:id`     | delete also clears `purchasedBy` on that employee's assets |
| GET             | `/api/employees/options`    | lightweight list for dropdowns (no filters)              |
| POST            | `/api/assets/:id/assign`    | `{ employeeId, assignedAt?, notes? }`                    |
| POST            | `/api/assets/:id/return`    | `{ returnedAt?, condition?, statusAfter?, notes? }`      |
| GET             | `/api/assets/:id/assignments` | assignment history of an asset                         |
| GET             | `/api/employees/:id/assets` | `{ employee, current, history }`                         |
| POST / DELETE   | `/api/assets/:id/image`     | upload (multipart field `image`) / remove the photo      |
| GET             | `/api/assets/:id/image/:fileId` | image bytes (needs the Bearer token)                 |

### Asset assignment

- **One asset, one employee.** The holder is stored in `asset.assignedTo`. Assigning uses a conditional update (`assignedTo: null, status: "Available"`), so two requests at the same moment can't both succeed. A unique partial index on `am_assignments` (one `active: true` record per asset) backs this up.
- **One employee can hold many assets.**
- **Who can be assigned what:** only **Available** assets, and not to **Exited** employees. Assignment and return dates can't be in the future. An assignment can't be dated before the purchase date, and a return can't be dated before its assignment.
- **History:** every hand-over is recorded in `am_assignments`, with the dates, the condition at hand-over and at return, notes, and who did it.
- **Status is controlled by assign and return.** The status can't be set to "Assigned" by editing, and an assigned asset's status can't be changed until it's returned. Assigned assets can't be deleted. An employee holding assets can't be deleted or marked Exited.
- **Images:** stored in MongoDB GridFS (bucket `am_asset_images`). JPEG, PNG or WebP only, up to 2 MB, and the type is checked from the file's actual bytes. Replacing or deleting an image also deletes the old file.

### List requests

Search, filters, pagination and sorting go in the JSON body. Query strings are not used.

```json
POST /api/assets/list
{
  "filter": { "searchText": "mac", "category": "Laptop", "status": "Assigned" },
  "pagination_info": { "page": 1, "perPageData": 20 },
  "sort": { "sortBy": "cost", "data": 1 }
}
```

- `filter`: optional. Only send the keys the user set. Unknown keys get a 400.
  - Assets (`/api/assets/list` and `/api/dashboard`): `searchText`, `category`, `status`, `condition`, `purchaseType`, `location`, `warrantyStatus` (`Active` | `Expired` | `Not Applicable`), `purchasedFrom` and `purchasedTo` (`YYYY-MM-DD`).
  - Employees (`/api/employees/list`): `searchText`, `department`, `status`, `workType`.
- `pagination_info`: `page` (default 1) and `perPageData` (1–100, default 10).
- `sort.data`: `0` default (newest first), `1` ascending, `2` descending. `sort.sortBy` is required when `data` is 1 or 2.

Response:

```json
{
  "items": [ ... ],
  "filter": { "searchText": "mac", "category": "Laptop", "status": "Assigned" },
  "pagination_info": { "page": 1, "nextPage": 2, "perPageData": 20, "totalPages": 3 },
  "sort": { "sortBy": "cost", "data": 1 },
  "totalCount": 47
}
```

`nextPage` is `null` on the last page. If `page` is past the end (for example after deletes), the last page is returned and `pagination_info.page` says which page it is.

`/api/dashboard` returns:
- KPIs
- counts by category, status, condition, warranty and location
- spend per month for 12 months
- assets with warranty expiring within 30 days
- recently added assets
- a people overview (all employees)
- the location options for the filter dropdown

Brand colours, the Roboto font and the logo come from the `fitshieldWebsite2.0` repo. The colours are set in `src/app/providers.js` and `src/app/globals.css`; the logo is `src/components/brand/Logo.js`.

Warranty Status is calculated when an asset is read (Active / Expired / Not Applicable). It is never stored, so it can't go stale.

## No query strings

The app sends no query strings at all. Every request was checked in a browser session: login, sidebar navigation, Back, filters and reload.

- **APIs:** search, filters, pagination and sorting go in the JSON body. Ids go in the path (`/api/assets/:id`).
- **Page navigation:** `/dashboard`, `/assets` and `/people` are served by one route, `app/(dashboard)/[[...slug]]`. Moving between them uses `history.pushState` (`src/lib/navigation.js`), so Next.js makes no `?_rsc=` request. Login and logout do a full page load.
- **"Session expired" notice:** passed to the login page in a one-minute cookie (`src/lib/notice.js`), not `?expired=1`.
- **Tab icon:** served from `public/icon.svg` so Next.js doesn't append a hash to its URL.

## Project layout

```
src/
  app/
    api/…                 Route handlers (backend)
    login/page.js         Login page
    (dashboard)/          Sidebar layout + one catch-all route ([[...slug]]) for every app page
  views/                  Dashboard / Assets / People screens (picked by pathname)
  components/             Antd modals, drawer, tags
  lib/                    db, jwt, api helpers, shared constants
  models/                 Mongoose models
  services/axios.js       Axios instance + interceptors
  store/                  Redux store, slices, thunks
  middleware.js           Auth guard for APIs and pages
scripts/seed.mjs          Seeds the login user
```
