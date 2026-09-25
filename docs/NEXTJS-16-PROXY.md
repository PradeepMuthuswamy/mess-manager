# Next.js 16 Proxy Architecture (`proxy.ts`)

In Next.js 16.2, the middleware convention has been replaced by **Proxy**. The proxy file is located at the project root as `proxy.ts` and exports an asynchronous `proxy` function.

This document describes the proxy conventions, security policies, authentication checks, and routing flow for the Officers Mess Manager client application (`mess-manager`).

---

## 1. Overview & Next.js 16 Breaking Changes

- **Filename & Location:** `proxy.ts` at the root of the project (replaces `middleware.ts`).
- **Exported Function:** `export async function proxy(request: NextRequest): Promise<NextResponse>` (replaces `export function middleware`).
- **Runtime Semantics:** Executes on the Edge/Node runtime prior to route resolution, matching configured routes to perform optimistic session inspection and navigation gating.
- **Proxy Discipline:** `proxy.ts` provides **optimistic** protection and cookie/session checks. Deep authorization (RBAC and granular capabilities) remains strictly enforced at page loaders (`requireRole()`, `requireCapability()`), server actions, and API route handlers (`withRoute()`). Business logic is never embedded in the proxy.

---

## 2. Matcher Configuration

The proxy skips static assets, Next internals, and specific authentication callbacks:

```typescript
export const config = {
  matcher: [
    // Skip Next internals + static assets + the auth callback/confirm/signout endpoints
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth/callback|auth/confirm|auth/signout).*)',
  ],
};
```

---

## 3. Session & Authentication (Better Auth)

Session validation is executed via Better Auth's server API:

```typescript
const session = await auth.api.getSession({ headers: request.headers });
const user = session?.user;
```

Better Auth reads the session cookie from request headers and resolves the authenticated user document from MongoDB.

---

## 4. Gating & Security Policies

### 4.1 Flow-Gate Cookie Confinement
For multi-step or sensitive flows (such as password reset and invitation acceptance):
- The `AUTH_FLOW_GATE_COOKIE` (`om-flow-gate`) confines partially-trusted sessions to permitted paths (e.g., `/reset-password`, `/accept-invite`, `/mfa/verify`, `/mfa/enroll`).
- Any attempt by a confined session to navigate to other application routes is intercepted and redirected back to the gated target.
- When unauthenticated, the gate cookie is deleted from the response.

### 4.2 Route Categorization & Redirection
- **Public Paths:** `/`, `/sign-in`, `/forgot-password`, `/reset-password`, `/accept-invite`, and all `/api/*` endpoints.
- **Protected Paths:** All operational routes (e.g., `/dashboard`, `/messing`, `/attendance`, `/ration`, `/bar`, `/guest-rooms`, `/billing`, `/settings`) require an active session. Unauthenticated users attempting to access protected routes are redirected to `/sign-in?next=${pathname}`.
- **Signed-in Redirection:** Authenticated users navigating to `/sign-in` or `/forgot-password` are redirected to `/dashboard`.

### 4.3 App Segregation
The client application (`mess-manager`) is segregated from the administrative console (`mess-admin`):
- Operational roles (`user`, `manager`, `unit_admin`) operate in `mess-manager`.
- If a platform administrator (`super_admin` or `admin`) attempts to sign in or access `mess-manager`, `proxy.ts` redirects them to the Admin Console (`NEXT_PUBLIC_ADMIN_APP_URL` or `/auth/signout?error=admin_console`).

---

## 5. Summary Flow Diagram

```text
Request Arrives at proxy.ts
          │
          ▼
   Matches matcher? ────(No)───► Proceed to asset/endpoint
          │ (Yes)
          ▼
   Fetch Better Auth Session
          │
          ├── Flow Gate Active? ──► Restrict to allowed gated paths
          │
          ├── Unauthenticated & Private? ──► Redirect to /sign-in?next=...
          │
          └── Authenticated User:
                ├── Role is super_admin/admin? ──(Yes)──► Redirect to Admin Console / Signout
                ├── Accessing /sign-in or /forgot-password? ──(Yes)──► Redirect /dashboard
                └── All checks pass ──────────────────────────────► NextResponse.next()
```
