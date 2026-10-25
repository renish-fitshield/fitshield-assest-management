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
| `am_assets`    | Assets (`assetId` auto-generated `FITSHIELD-DELL-26-001`), each with its own `assignmentHistory` and `activities` arrays |
| `am_employees` | Employees (`employeeId` auto-generated, see below) |
| `am_categories` | Asset categories (unique name, any capitalisation); assets store `categoryId` + the `category` name |
| `am_counters`  | Sequences for the human-readable IDs             |

## Auth flow

1. `POST /api/auth/login` checks the email and 4-digit PIN. It returns a short-lived **access token** in the response body and sets a **refresh token** as an `httpOnly` cookie.
2. The access token is kept **only in Redux memory**. Nothing goes in localStorage or sessionStorage.
3. The Axios request interceptor attaches `Authorization: Bearer <token>`.
4. `src/middleware.js` verifies the token on every `/api/*` route except the public ones (`login`, `refresh`, `logout`). An expired token gets `401 { code: "TOKEN_EXPIRED" }`.
5. The Axios response interceptor catches `TOKEN_EXPIRED`, calls `POST /api/auth/refresh` once (concurrent requests share that call) and retries the original request.
6. When the refresh cookie expires (`REFRESH_TOKEN_TTL_SECONDS`, 8h by default), the user is sent to `/login` with a "session expired" message.
7. After 5 wrong PINs the account is locked for 15 minutes.

Page routes (`/assets`, `/categories`, `/people`) are also guarded by middleware using the refresh cookie.

## API

All routes need `Authorization: Bearer <accessToken>` unless marked public.

| Method          | Route                       | Notes                                                    |
| --------------- | --------------------------- | -------------------------------------------------------- |
| POST            | `/api/auth/login`           | public                                                   |
| POST            | `/api/auth/refresh`         | public (uses cookie)                                     |
| POST            | `/api/auth/logout`          | public (clears cookie)                                   |
| GET             | `/api/auth/me`              | current user                                             |
| POST            | `/api/dashboard`            | chart-ready dashboard metrics; body `{ filter }`         |
| POST            | `/api/assets/list`          | list assets (body below)                                 |
| POST            | `/api/assets`               | create asset                                             |
| GET / PUT / DELETE | `/api/assets/:id`        | create/update take `categoryId`; the server fills in `category` (the name) |
| GET / POST      | `/api/categories`           | list (A→Z, with `assetCount`) / add `{ name }`; 409 if the name exists in any capitalisation |
| PUT             | `/api/categories/:id`       | rename `{ name }`, also renamed on its assets. No DELETE: categories can't be removed |
| POST            | `/api/employees/list`       | list employees (body below)                              |
| POST            | `/api/employees`            | create employee. `employmentType` is `Full-Time` (default) or `Intern`. Full-Time needs a `workEmail` ending in `@fitshield.in`; Intern can use any valid email (checked on update too). Existing employees: `npm run migrate:employment-type` sets them to Full-Time |
| GET / PUT / DELETE | `/api/employees/:id`     | delete also clears `purchasedBy` on that employee's assets |
| GET             | `/api/employees/options`    | lightweight list for dropdowns (no filters)              |
| POST            | `/api/assignments`          | assign several assets to one employee: `{ employeeId, assetIds, assignedAt?, expectedReturnAt?, notes? }` |
| POST            | `/api/assignments/log`      | every hand-over across assets (body `{ filter: { searchText, action, employeeId, acknowledgement }, pagination_info }`) |
| GET             | `/api/assignments/summary`  | assigned now, awaiting acknowledgement, overdue, due in 7 days |
| POST            | `/api/assets/:id/acknowledgement-email` | resend an acknowledgement email: `{ eventId, side: "to" \| "from" }` |
| GET / POST      | `/api/acknowledgements/:token` | **public**: the emailed link — view / acknowledge a hand-over |
| GET             | `/api/acknowledgements/:token/status` | **public**: acknowledgement status check (asset, employee, hand-over, status) |
| POST            | `/api/assets/:id/assign`    | `{ employeeId, assignedAt?, condition?, expectedReturnAt?, notes? }` |
| POST            | `/api/assets/:id/transfer`  | straight to another employee: `{ employeeId, transferredAt?, condition?, expectedReturnAt?, notes? }` |
| POST            | `/api/assets/:id/return`    | `{ returnedAt?, condition?, statusAfter?, notes? }` (`statusAfter`: Available, Under Repair, Retired, Lost) |
| GET             | `/api/assets/:id/history`   | `{ assignmentHistory, activities, createdAt }`, newest first |
| GET             | `/api/employees/:id/assets` | `{ employee, current, history }`; `history` is every period they held an asset |
| POST / DELETE   | `/api/assets/:id/image`     | upload (multipart field `image`) / remove the photo      |
| GET             | `/api/assets/:id/image/:fileId` | image bytes (needs the Bearer token)                 |

### Asset assignment

- **Three hand-overs:** **Assign** (to an employee), **Transfer** (straight from one employee to another) and **Return** (taken back; the asset becomes Available, Under Repair, Retired or Lost). Each can record the condition and notes, and Assign/Transfer an optional **expected return date**. Assets past that date show as **Overdue** (Assets filter "Return due", dashboard card).
- **One asset, one employee. One employee can hold many assets.** The holder is `asset.assignedTo`.
- **Who can be assigned what:** only **Available** assets with quantity 1, and never to **Exited** employees.
- **Dates:** no hand-over can be in the future or dated before the previous one (or, for the first assignment, before the purchase date), so the history is always in order.
- **History lives on the asset**, in two append-only arrays:
  - `assignmentHistory`: one entry per hand-over: `action` (Assigned / Transferred / Returned), `from` / `to` employee, `date`, `condition`, `expectedReturnAt`, `statusAfter`, `notes`, `by` (the user who did it) and `at` (when it was recorded).
  - `activities`: every change to the asset (created, edited, photo, assigned, transferred, returned), with each field's **before → after**, `by` and `at`. Edits that change nothing aren't logged.
  - Employees and users are stored as they were at the time, so history survives renames and deletions.
- **Always consistent:** each hand-over is one atomic update that changes the asset, appends to both arrays and only matches the asset version it checked (`__v`). If two people act at once, one gets a 409 and must refresh. Edits use Mongoose optimistic concurrency the same way. The arrays are left out of every response except `GET /api/assets/:id/history`.
- **Status is controlled by the hand-overs.** The status can't be set to "Assigned" by editing, and an assigned asset's status can't be changed until it's returned. Assigned assets can't be deleted (deleting an asset deletes its history too). An employee holding assets can't be deleted or marked Exited.
- **Assignments page** (`/assignments`): who holds what right now (acknowledgement, due date, transfer / return / resend), counts of what needs attention, and a log of every hand-over. "Assign assets" hands one or more assets to an employee at once.

### Acknowledgements

- **Every hand-over is emailed** to the employee(s) involved, at their current work email: **Assign** → a receipt email to the new holder; **Return** → a return email to the person who gave it back; **Transfer** → both. The emails carry the Fitshield logo (inline image) and name, the asset details, a centred **Acknowledge** button, and "In case of any query, contact Jeel Borda".
- **The button opens `/acknowledge/<token>`** (no login). The token is signed, names the asset, the hand-over, the employee and the side, and expires after 30 days. Opening the link records nothing, so email link scanners can't acknowledge on someone's behalf.
- **Checks, in order** (`resolveLink` in `src/lib/acknowledgements.js`), run before the page is sent and again right before an acknowledgement is saved:
  1. The link is genuine.
  2. The **asset** exists.
  3. The **employee** exists.
  4. The hand-over is on that asset and names that employee.
  5. The **status** (Pending until acknowledged).

  Each failed check has its own screen and error `code`: `LINK_INVALID`, `ASSET_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `HANDOVER_NOT_FOUND`, or `LINK_EXPIRED` when an expired link is still pending. An expired link that was already acknowledged still shows as done.
- **The page:**
  - **Pending:** shows the details and a declaration tick box. The **Acknowledge** button works once the box is ticked.
  - **Already acknowledged:** opens on the done screen with an "Already acknowledged" dialog.
  - **While a page is open:** if it's acknowledged elsewhere, the page notices when the employee returns to the tab.
  - **Double clicks:** two tabs or a double click record it only once.
  - **Read back:** the result is read back from the database before "Thank you" is shown.
- **APIs (public, by token):**
  - `GET /api/acknowledgements/:token`: the details plus the status.
  - `GET /api/acknowledgements/:token/status`: the status check only. It returns `status`, `acknowledgedAt`, `canAcknowledge`, `linkExpired` and `checks`.
  - `POST /api/acknowledgements/:token`: records the acknowledgement and returns the stored status. `alreadyAcknowledged` is true if it had been done before.
- **The admin pages** (Assets, Assignments, Dashboard) reload when you come back to their browser tab, so new acknowledgements show without pressing Refresh.
- **Status:** each side starts **Pending** and becomes **Acknowledged** with the time, IP and browser (`toAck` / `fromAck` on the hand-over). The current holder's status is mirrored on `asset.acknowledgement` for lists and filters, and the activity log records it.
- **Emails never block a hand-over.** If sending fails, the hand-over still happens, the failure is recorded and shown, and the email can be resent (with a fresh link) from the asset's history or the Assignments page.
- **Setup (in use): Zoho ZeptoMail.** This is the transactional email service the Fitshield backend already uses; `fitshield.in` is verified there, so any `@fitshield.in` sender works. Set `MAIL_PROVIDER=zeptomail`, `SMTP_USER=emailapikey`, `SMTP_PASS=<ZeptoMail Send Mail token>` and `MAIL_FROM="Fitshield Asset Management <jeel.borda@fitshield.in>"`. Ideally give this app its own token (ZeptoMail → Mail Agents → SMTP).
- **Alternatives:** one sending mailbox delivers to every inbox (Outlook, Zoho, Gmail, Yopmail…). fitshield.in mailboxes are on Microsoft 365, so the other options are:
  - **`MAIL_PROVIDER=microsoft365` (recommended):** Microsoft Graph. Needs an app registration in Microsoft Entra with the **Mail.Send** application permission (admin consented), giving `MS_CLIENT_ID` and `MS_CLIENT_SECRET`. `MS_TENANT_ID` can be `fitshield.in`. No mailbox password is stored.
  - **`MAIL_PROVIDER=outlook`:** SMTP with the mailbox password (`SMTP_USER` / `SMTP_PASS`). Needs "Authenticated SMTP" switched on for the mailbox, and Microsoft may refuse passwords for SMTP altogether.
  - **Other providers:** `zoho-in`, `zoho`, `zoho-eu` and `gmail` presets are also available, or any server via `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE`.
  - **Then:** set the same values plus `APP_URL` on Vercel, and run `npm run mail:test -- someone@yopmail.com`. It signs in and sends a test email, or says exactly what to fix.
  - **Without any of this:** development sends to an Ethereal test inbox and the app clearly says the email was **not delivered**; production marks it as failed. Yopmail can only receive, so it can't be the sender.
- **Contact:** both emails and the acknowledgement page say "In case of any query, please contact Jeel Borda on +91 95126 62666" (`QUERY_CONTACT_*` in `src/lib/constants.js`).
- **Employee IDs:** `FSEMP-<department code>-<serial>`, e.g. `FSEMP-ENG-0001`.
  - **The parts:** FS = Fitshield, EMP = employee.
  - **Serials:** count up separately for each department.
  - **Codes:** ENG Engineering, PRD Product, DSN Design, DSC Data Science, QA, DVO DevOps, HR Human Resources, FIN Finance, SAL Sales, MKT Marketing, OPS Operations, CS Customer Support, MGT Management (`DEPARTMENT_CODES` in `src/lib/constants.js`).
  - **Fixed once given:** an ID is assigned when the employee is added and never changes, even if they move department. It's stored on hand-overs, in the activity log and in sent emails.
  - **Migrating older IDs:** `npm run migrate:employee-ids` (add `-- --dry-run` to preview) renumbers employees from before this format (`EMP-0001`) department by department, oldest first. It also updates the copies in assets' history, activity log and "Purchased by". The old ID is kept in `previousEmployeeIds`, so searching it still finds the employee. It's safe to run again.
- **Old records:** `npm run migrate:assignment-history` copies the old `am_assignments` records into the assets' history (the collection itself is no longer used).
- **Images:** stored in MongoDB GridFS (bucket `am_asset_images`). JPEG, PNG or WebP only, up to 2 MB, and the type is checked from the file's actual bytes. Replacing or deleting an image also deletes the old file.

### List requests

Search, filters, pagination and sorting go in the JSON body. Query strings are not used.

```json
POST /api/assets/list
{
  "filter": { "searchText": "mac", "categoryId": "6adda54f9de264881cb4f825", "status": "Assigned" },
  "pagination_info": { "page": 1, "perPageData": 20 },
  "sort": { "sortBy": "cost", "data": 1 }
}
```

- `filter`: optional. Only send the keys the user set. Unknown keys get a 400.
  - Assets (`/api/assets/list` and `/api/dashboard`): `searchText`, `categoryId`, `status`, `condition`, `purchaseType`, `location`, `warrantyStatus` (`Active` | `Expired` | `Not Applicable`), `purchasedFrom` and `purchasedTo` (`YYYY-MM-DD`).
  - Employees (`/api/employees/list`): `searchText`, `department`, `status`, `workType`.
- `pagination_info`: `page` (default 1) and `perPageData` (1–100, default 10).
- `sort.data`: `0` default (newest first), `1` ascending, `2` descending. `sort.sortBy` is required when `data` is 1 or 2.

Response:

```json
{
  "items": [ ... ],
  "filter": { "searchText": "mac", "categoryId": "6adda54f9de264881cb4f825", "status": "Assigned" },
  "pagination_info": { "page": 1, "nextPage": 2, "perPageData": 20, "totalPages": 3 },
  "sort": { "sortBy": "cost", "data": 1 },
  "totalCount": 47
}
```

`nextPage` is `null` on the last page. If `page` is past the end (for example after deletes), the last page is returned and `pagination_info.page` says which page it is.

`/api/dashboard` (built in `src/lib/dashboard.js`) returns rows shaped for the charts, so the UI binds them without reshaping:
- `kpis`: totals, value and average cost, status counts, utilization (assigned ÷ assigned + ready to assign), acknowledgement rate, overdue / due-soon returns, warranties ending within 30 days, and spend in the window vs the previous 12 months
- `charts`:
  - `monthly`: one row per month (`spend`, `assets`, `units`)
  - `handOvers`: one row per month (`Assigned`, `Transferred`, `Returned`)
  - `status`, `condition`, `warranty`, `age` and `locations`: one row per bucket
  - `categories`: one row per category with a count per status, top 10 with the rest folded into "Other"
  - `departments`: employees vs the assets they hold
- `people`: employees by status and employment type, holders and top holders
- `lists`: warranties ending soon, overdue returns, recently added assets, latest hand-overs
- `window`: the months the trend charts cover (the purchased-date range if set, at most 24; otherwise the last 12)
- the location options for the filter dropdown (category dropdowns load from `GET /api/categories`)

Asset figures follow the filters; employee counts cover everyone.

The dashboard charts use [Recharts](https://recharts.org) (`src/components/dashboard/`).
- **Colours:** set once in `chartTheme.js`, by role (asset status, warranty, hand-over action, condition, age). They were checked for colour-blind separation and contrast.
- **Table view:** every chart card has one, so values can be read without hovering.
- **Click to filter:** clicking a status, category, condition, location or warranty row filters the whole dashboard.
- **Lazy loading:** the charts load on demand (`charts.js`), so the other pages don't download Recharts.

Brand colours, the Roboto font and the logo come from the `fitshieldWebsite2.0` repo. The colours are set in `src/app/providers.js` and `src/app/globals.css`; the logo is `src/components/brand/Logo.js`.

Warranty Status is calculated when an asset is read (Active / Expired / Not Applicable). It is never stored, so it can't go stale.

## No query strings

The app sends no query strings at all. Every request was checked in a browser session: login, sidebar navigation, Back, filters and reload.

- **APIs:** search, filters, pagination and sorting go in the JSON body. Ids go in the path (`/api/assets/:id`).
- **Page navigation:**
  - **One route:** `/dashboard`, `/assets`, `/assignments`, `/categories` and `/people` are all served by `app/(dashboard)/[[...slug]]`.
  - **No reloads between them:** moving between them uses `history.pushState` (`src/lib/navigation.js`, `APP_ROUTES`), so Next.js makes no `?_rsc=` request and already-loaded data is kept.
  - **Login and logout** do a full page load.
- **Loading:** the sidebar and header are always on screen, and the Fitshield splash with the animated logo (`components/brand/SplashScreen.js`) only ever fills the content.
  - **While the session is restored or you're signing out:** it fills the content area.
  - **While a page's data loads** (first load, new filters, search, page, sort, the dashboard's Refresh): it fills that page's data area, a table or the dashboard's charts, via `components/DataLoader.js`. The page title, filters and search stay visible.
  - **Background updates of the same data** (coming back to the tab, after saving) refresh in place without it.
  - **Reduced motion:** the animation stops when the device asks for it.
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
