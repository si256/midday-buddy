# MidDay Buddy 2.0 --- Full Source Validation & Implementation Change Report

**Prepared for:** Google Gemini Studio AI (code modification task)\
**Application:** MidDay Buddy\
**Source reviewed:** `midday-buddy-main.zip`\
**Production target:** 10,000 registered users in year one\
**Hosting constraint:** Cloudflare ecosystem; initial infrastructure
budget ₹0/month\
**Requested approach:** Rebuild the backend and production foundation
while preserving/refactoring the useful existing React product UI.

> **Purpose:** Upload this report together with the complete source ZIP
> into Gemini Studio. Instruct Gemini to implement the changes in the
> actual project files, not merely return another architecture proposal.
> This is a source-code review and implementation specification. It is
> not a penetration-test certificate or a claim that all browser/API
> tests have already passed.

------------------------------------------------------------------------

# 1. Executive summary

## 1.1 Overall assessment

**Current production readiness: NOT READY for public launch.**

The repository contains a useful React product interface and a
Cloudflare Pages Functions/D1 backend prototype. It also contains a
separate Express server implementation and localStorage-based
persistence. These overlapping execution paths create inconsistent
behaviour and make it difficult to know which system is authoritative.

The most important blockers are:

1.  Authentication tokens are generated but are not backed by a
    server-side session store.
2.  `/api/auth/me` accepts any non-empty Bearer token and returns a
    hardcoded administrator identity.
3.  A hardcoded administrator email/password is present in source code.
4.  Passwords are stored/compared as plaintext in the Cloudflare API
    code.
5.  The password reset API reports success without persisting or
    authorizing a real reset.
6.  Privileged user and campus management APIs trust `adminId` and
    `adminName` supplied in request bodies instead of authenticating the
    caller.
7.  Chat and break operations do not consistently authenticate the user
    or verify ownership/membership.
8.  Several frontend API calls do not have matching Cloudflare Pages
    Functions handlers.
9.  Unknown API routes return HTTP 200 from a catch-all handler.
10. Notification and audit-log endpoints return empty/success
    placeholders.
11. The frontend polls the backend every four seconds, which is
    inefficient at the intended scale.
12. Browser localStorage contains fallback/demo state, including a
    master administrator account, and can conflict with the server
    database.
13. Runtime schema creation and swallowed database errors make
    deployment failures difficult to detect.
14. There is no complete automated integration/E2E/load-test pipeline in
    the project.

**Do not expose the existing deployment to unrestricted public
registration or administrator operations until the critical issues are
corrected.** Keep the existing production database separate from the V2
staging database. Do not migrate plaintext passwords.

## 1.2 What is present in the repository

-   React 19 + TypeScript + Vite frontend.
-   Tailwind CSS v4 and Lucide icons.
-   Cloudflare Pages Functions under `functions/api`.
-   Cloudflare D1 database access helpers.
-   Express fallback server in `server.ts`.
-   SQL files: `migration.sql` and `schema.sql`.
-   LocalStorage-based `StorageService`.
-   API client in `src/services/api.ts`.
-   UI components for authentication, admin, profiles, breaks, chat,
    notifications and navigation.
-   Two helper test files: `src/utils/auth.test.ts` and
    `src/utils/matching.test.ts`.
-   An AI Studio implementation plan under
    `.aistudio/artifacts/.../implementation_plan.md`.

The product concept is valid: users register, await campus-admin
approval, publish short break availability, discover colleagues,
connect/chat, and campus admins manage users/locations. Retain these
product workflows while replacing unsafe implementation details.

------------------------------------------------------------------------

# 2. Validation scope and evidence classification

This report separates four kinds of information:

-   **Confirmed source finding:** directly visible in the uploaded
    source code.
-   **Static route finding:** frontend API calls compared with backend
    file-based route handlers.
-   **Design requirement:** change required for the target production
    architecture.
-   **Runtime validation pending:** requires dependency installation, a
    running Worker/D1 staging environment, browser interaction, or
    external load/security testing.

Do not describe a runtime test as passed unless Gemini actually runs it
and records the command, environment, result and evidence.

## 2.1 Tests not yet verified

The following were not established by this static source review:

-   A clean `npm install` and production Vite build.
-   Full TypeScript compilation of the complete application.
-   Live deployment browser testing.
-   End-to-end registration/login/admin approval.
-   Cloudflare D1 staging integration.
-   Real-time chat delivery.
-   Multi-user concurrency.
-   Mobile-device testing on physical browsers.
-   OWASP penetration testing.
-   A 10,000-user load test.
-   Backup restore and disaster-recovery testing.

The earlier project preparation did not establish these as passed.
Gemini must execute them after implementation.

------------------------------------------------------------------------

# 3. Critical security findings and mandatory fixes

Severity definitions:

-   **P0 Critical:** exploitable or fundamentally unsafe; block public
    launch.
-   **P1 High:** major authorization, integrity, privacy or reliability
    weakness.
-   **P2 Medium:** functional, operational or scalability issue.
-   **P3 Low:** maintainability, UX or polish.

## SEC-001 --- Hardcoded master administrator credentials

**Severity:** P0 Critical\
**Evidence:** - `functions/api/auth/login.ts` --- `DEFAULT_USERS`
contains `admin@middaybuddy.com` and `Admin@12345`; login also
explicitly accepts these credentials. - `functions/api/users/index.ts`
--- hardcoded master administrator fallback. - `src/data/seedData.ts`
--- `INITIAL_USERS` contains the same administrator and plaintext
password. - `src/services/storage.ts` --- automatically inserts/repairs
the master administrator in browser localStorage.

**Risk:** Anyone who obtains the source can discover the administrator
credentials. Browser-side seeding is not an authentication boundary.

**Required changes:** 1. Remove all hardcoded production credentials and
password literals. 2. Remove automatic client-side master-admin
creation. 3. Create the initial platform administrator using a one-time,
server-only bootstrap procedure or a secure manual D1 provisioning
script. 4. Store only a password hash. 5. Require MFA for platform
administrators if feasible; at minimum add strong reauthentication for
privileged actions. 6. Ensure no default admin account is created in
production automatically. 7. Add a test proving the default credentials
no longer work. 8. If this credential was ever deployed, treat it as
compromised and rotate/revoke it.

## SEC-002 --- `/api/auth/me` accepts any Bearer token and returns administrator

**Severity:** P0 Critical\
**Evidence:** `functions/api/auth/me.ts`, lines 18--39 (approximate): it
checks only whether the Authorization header begins with `Bearer`, then
returns a hardcoded `usr_admin` object.

**Risk:** Any arbitrary string can be used as a token to impersonate the
administrator in the API response.

**Required changes:** 1. Replace this handler with real session lookup.
2. Generate cryptographically secure, unpredictable session identifiers.
3. Store only a hash of the session token in D1. 4. Validate expiry,
revocation, user status and role on every protected request. 5. Return
the authenticated user's actual safe profile from D1. 6. Return 401 for
missing, invalid, expired or revoked sessions. 7. Never infer identity
from client-provided user IDs or role fields. 8. Add tests for random
tokens, expired tokens, revoked tokens, suspended users and pending
users.

## SEC-003 --- Plaintext password storage and comparison

**Severity:** P0 Critical\
**Evidence:** - `functions/api/auth/register.ts`, lines 45--63 and
117--126: raw password is assigned to `newUser.password`, and both
`password` and `password_hash` columns are populated with the raw
password. - `functions/api/auth/login.ts`, lines 122--125: stored
password is compared directly with the submitted password. -
`functions/api/users/index.ts`, around lines 103--108 and 134--140:
default password and raw password fields are written. -
`functions/api/auth/set-new-password.ts`, lines 32--55: raw new password
is written to both columns. - `src/data/seedData.ts` and localStorage
fallback also contain the raw administrator password.

**Risk:** A database leak exposes every password. The `password_hash`
column name does not make plaintext safe.

**Required changes:** 1. Remove the `password` column from the new
schema. 2. Use a maintained password-hashing implementation compatible
with Cloudflare Workers. Prefer a proven Argon2id implementation if it
can run within Worker constraints; otherwise use a well-reviewed
PBKDF2-HMAC-SHA-256 implementation with a unique cryptographically
random salt and a sufficiently high iteration count, benchmarked against
the Worker CPU limit. 3. Never use plain SHA-256 or reversible
encryption as password storage. 4. Store algorithm/version, salt and
derived hash in a well-defined format. 5. Use constant-time comparison
where applicable. 6. Enforce password length and
breached/common-password policy. Do not rely on a six-character minimum.
7. Ensure password hashes never appear in API responses, logs, audit
entries or frontend state. 8. Add password-hash migration/re-enrolment:
because old values are plaintext, do not copy them as hashes. Require
password reset for legacy accounts. 9. Add tests for correct password,
incorrect password, malformed hash, salt uniqueness and hash
verification.

## SEC-004 --- Privileged API operations trust client-provided admin identity

**Severity:** P0 Critical\
**Evidence:** These endpoints read `body.adminId` and `body.adminName`
as the acting administrator: - `functions/api/users/index.ts` -
`functions/api/users/[id].ts` - `functions/api/users/[id]/approve.ts` -
`functions/api/users/[id]/reject.ts` -
`functions/api/users/[id]/role.ts` -
`functions/api/users/[id]/toggle-status.ts` -
`functions/api/communities/index.ts` -
`functions/api/communities/[id].ts` -
`functions/api/communities/[id]/locations.ts` -
`functions/api/communities/[id]/locations/[locId].ts`

**Risk:** An unauthenticated caller may submit a fabricated
`adminId`/`adminName` and attempt privileged changes. Audit attribution
is also forgeable.

**Required changes:** 1. Implement shared `requireAuth()` and
`requireRole()` middleware/helpers. 2. Derive the actor ID, name, role
and campus permissions exclusively from the verified server session and
database. 3. Ignore/reject client-supplied `adminId`, `adminName`,
`role`, approval status and ownership fields. 4. Platform-admin-only
operations: create/promote campus admins, create/delete campuses,
platform-wide user management. 5. Campus-admin operations: manage only
users and locations in campuses they administer. 6. Normal members: no
admin operations. 7. Add authorization tests for anonymous, member,
campus admin from another campus and platform admin.

## SEC-005 --- Password reset endpoints are not a real persisted workflow

**Severity:** P0 Critical\
**Evidence:** - `functions/api/auth/forgot-password.ts`: returns success
but does not store a reset request or verify the account. -
`functions/api/auth/reset-requests.ts`: always returns an empty array. -
`functions/api/auth/approve-reset/[id].ts`: returns success without
updating a request. - `functions/api/auth/set-new-password.ts`: accepts
`userId` and `newPassword` from the request and updates a user without
validating an approved, single-use reset grant.

**Risk:** False success messages; reset flow cannot work reliably; a
caller may attempt to set another user's password by knowing their user
ID.

**Required changes:** 1. Persist reset requests in D1 with status,
timestamps and requester ID. 2. Return a generic response that does not
disclose whether an email exists. 3. Rate-limit requests and apply
anti-automation protection. 4. Admin approval must require authenticated
authorized admin. 5. Generate a cryptographically secure, single-use
reset token; store only its hash. 6. Token must expire, be scoped to one
account and be consumed atomically once. 7. Reset must require valid
token, not a caller-supplied user ID alone. 8. Revoke all existing
sessions after password reset. 9. Record admin decision and reset
completion in audit log. 10. Add complete workflow tests.

## SEC-006 --- Chat endpoints lack authentication and conversation authorization

**Severity:** P0 Critical\
**Evidence:** `functions/api/chat.ts`, `onRequestGet` and
`onRequestPost`: - GET queries messages by conversation ID without
validating the caller. - POST accepts sender ID and sender name from the
request body. - No check verifies that sender belongs to the
conversation. - No check verifies that the user is approved/active or
not blocked.

**Risk:** Unauthorized users may read conversations or inject messages
while impersonating another sender.

**Required changes:** 1. Require valid session and approved/active
account. 2. Derive sender identity from session, never body. 3. Verify
caller is a conversation participant. 4. Enforce block/report rules and
campus/meetup membership. 5. Validate message length, content type and
rate limits. 6. Use cursor-based pagination. 7. Store message timestamps
from server. 8. Add tests for outsider read/write, forged sender,
blocked user, suspended user and oversized message.

## SEC-007 --- Break creation lacks authenticated ownership validation

**Severity:** P0 Critical\
**Evidence:** `functions/api/breaks.ts`, `onRequestPost`: - Accepts
`body.userId`. - Inserts break without checking authenticated session or
user status. - Does not validate that the selected campus/location
belongs to the same campus. - Duration and text inputs are not safely
bounded.

**Risk:** Users can potentially post on behalf of others, create invalid
records or bypass approval.

**Required changes:** 1. Require authenticated, approved, non-suspended
user. 2. Set `user_id` from session. 3. Validate allowed break types and
duration bounds. 4. Validate campus membership and location-to-campus
relationship. 5. Enforce one or a defined number of active breaks per
user. 6. Add ownership checks for extend/complete/delete. 7. Expire
stale posts consistently and index expiry lookups. 8. Add tests for
ownership, invalid duration, invalid campus, expired posts and suspended
users.

## SEC-008 --- User listing and user management APIs are not protected

**Severity:** P0 Critical\
**Evidence:** `functions/api/users/index.ts`, `onRequestGet` and
`onRequestPost`; `functions/api/users/[id].ts`.

**Risk:** Personal data and administrative functions may be exposed to
unauthorized callers. User creation accepts role/status/password fields
from the request.

**Required changes:** 1. Protect user directory endpoints with role and
campus scopes. 2. Separate member-safe profile responses from admin-only
directory fields. 3. Never return password/password_hash. 4. Enforce
pagination, search limits and field allowlists. 5. Only authorized admin
can create or change roles. 6. Do not allow a caller to set
`status: approved` during self-registration. 7. Add tests for PII
exposure and privilege escalation.

## SEC-009 --- CORS is wildcard across API handlers

**Severity:** P1 High\
**Evidence:** Many `functions/api/*.ts` handlers set
`Access-Control-Allow-Origin: *`.

**Risk:** Wildcard CORS is inappropriate for a cookie-authenticated
private application and increases cross-origin exposure.

**Required changes:** 1. Define an explicit allowlist for
production/staging origins. 2. Do not combine wildcard CORS with
credentialed cookies. 3. Configure `Access-Control-Allow-Credentials`
only where required. 4. Validate Origin on state-changing requests and
use CSRF protection with cookie sessions. 5. Keep local development
origins separate from production. 6. Add CORS tests for allowed and
untrusted origins.

## SEC-010 --- Catch-all route reports unknown API requests as successful

**Severity:** P1 High\
**Evidence:** `functions/api/[[catchall]].ts`, final handler returns
HTTP 200 and `{status:"ok", message:"Cloudflare Pages API fallback"}`
for any unmatched API route.

**Risk:** The frontend may treat missing endpoints as successful.
Monitoring and debugging become misleading.

**Required changes:** 1. Unknown API paths must return HTTP 404 JSON. 2.
Unsupported methods must return 405 with an Allow header where
appropriate. 3. Use a consistent error envelope and request/correlation
ID. 4. Never return success for an unimplemented route. 5. Add tests for
unknown paths and unsupported methods.

## SEC-011 --- Sensitive database and authorization errors are swallowed

**Severity:** P1 High\
**Evidence:** Multiple endpoints use `.catch(() => {})`, catch database
query errors and return empty arrays/default data.

**Risk:** Database failure may be presented as an empty result or
successful write. This hides data loss and deployment configuration
problems.

**Required changes:** 1. Do not silently ignore critical database
writes. 2. Return proper 4xx/5xx status codes and safe error messages.
3. Log structured server-side errors with correlation IDs; never log
secrets. 4. Use transactions/batches for related writes where supported.
5. Add tests for D1 unavailable, schema mismatch, constraint failure and
partial-write scenarios.

## SEC-012 --- LocalStorage is used as an alternate source of truth

**Severity:** P1 High\
**Evidence:** `src/services/storage.ts` persists users, session user ID,
communities, breaks, conversations, messages, notifications and audit
logs in localStorage. `src/services/api.ts` also uses localStorage for
bearer tokens and reset requests.

**Risk:** Browser state can be edited by the user, is not shared across
devices and can diverge from D1. Sensitive information can be exposed to
XSS.

**Required changes:** 1. Remove localStorage as the authoritative source
for users, roles, sessions, approvals, messages, notifications, breaks
and audit records. 2. Keep only harmless UI preferences in localStorage.
3. Use server-managed HttpOnly session cookies; do not store bearer
session tokens in localStorage. 4. On app startup, load
`/api/v1/auth/me` and treat server response as authoritative. 5. Remove
seeded admin and fake member records from production bundles. 6. Provide
explicit demo fixtures only in a local development environment.

------------------------------------------------------------------------

# 4. Functional and API validation findings

## FUNC-001 --- Frontend/backend route mismatches

The frontend API client is `src/services/api.ts`. The Cloudflare route
handlers are file-based under `functions/api`.

The following mismatches are visible in the repository:

  ----------------------------------------------------------------------------------------------------------------------------------------
  Frontend request                      Frontend source         Cloudflare handler present?     Required action
  ------------------------------------- ----------------------- ------------------------------- ------------------------------------------
  `GET /api/chat/:conversationId`       `src/services/api.ts`   No matching dynamic route; only Add
                                        around 972              `functions/api/chat.ts`         `functions/api/chat/[conversationId].ts`
                                                                                                or redesign API consistently

  `POST /api/chat/:conversationId`      around 983              No matching dynamic route       Same as above

  `POST /api/breaks/:id/extend`         around 627              No                              Implement secure handler

  `POST /api/breaks/:id/complete`       around 647              No                              Implement secure handler

  `GET /api/users/:id`                  around 681              No GET handler in               Implement safe profile handler
                                                                `functions/api/users/[id].ts`   

  `PUT /api/users/:id`                  around 807/858          No PUT handler in               Implement authenticated profile update
                                                                `functions/api/users/[id].ts`   

  `POST /api/notifications/mark-read`   around 1021             No matching route               Implement ownership-checked notification
                                                                                                update

  `GET /api/audit-logs`                 around 1037             Handler exists but always       Implement protected database query
                                                                returns `[]`                    

  `GET /api/auth/reset-requests`        around 293              Handler exists but always       Implement persisted admin queue
                                                                returns `[]`                    

  `POST /api/auth/approve-reset/:id`    around 309              Handler exists but only returns Implement real approval
                                                                success                         

  `POST /api/auth/set-new-password`     around 347              Handler exists but is unsafe    Replace with token-based reset
  ----------------------------------------------------------------------------------------------------------------------------------------

**Important:** `server.ts` has a number of Express routes that do not
exist as Cloudflare Pages handlers. Do not assume the Express
implementation is deployed on Cloudflare. The Cloudflare Functions path
is the production backend in the current deployment.

## FUNC-002 --- Notifications are placeholders

**Evidence:** `functions/api/notifications.ts`: - GET returns `[]`. -
POST returns `{success:true}` without storing anything.

**Required:** Create notification records in D1, scope each query/update
to the authenticated recipient, implement pagination/read status and a
defined delivery strategy. A successful POST must correspond to a
persisted operation.

## FUNC-003 --- Audit logs are placeholders and are not reliably immutable

**Evidence:** `functions/api/audit-logs.ts` always returns `[]`. Other
endpoints accept actor identity from body and swallow audit insert
errors.

**Required:** - Persist audit events for registration decisions, role
changes, suspensions, campus/location changes, moderation, reset
approvals and account deletion. - Actor must come from verified
session. - Audit write should be part of the same logical operation or a
durable outbox. - No normal API may edit/delete audit events. -
Admin-only paginated read endpoint. - Include actor, action, target,
campus scope, timestamp, request ID and safe metadata; never include
passwords/tokens. - Test that failed audit persistence does not silently
report a sensitive admin action as complete.

## FUNC-004 --- Campus CRUD does not enforce campus/platform admin permissions

**Evidence:** `functions/api/communities/index.ts`,
`communities/[id].ts`, and nested location handlers accept writes and
client-provided admin attribution without verified authorization.

**Required:** Add role/scope checks, validation, uniqueness constraints,
safe delete/archive strategy, audit and relationship checks. A campus
admin must not edit another campus.

## FUNC-005 --- Profile API incomplete

**Evidence:** `functions/api/users/[id].ts` only exports
`onRequestDelete`; frontend attempts GET and PUT.

**Required:** Implement: - `GET /api/v1/me/profile` -
`PATCH /api/v1/me/profile` - Admin profile view with campus scope. -
Explicit editable-field allowlist. - Prevent user changing their own
role, status, employee verification, campus-admin grants or approval
state. - Validate text lengths and interest/dietary values.

## FUNC-006 --- Break lifecycle incomplete

**Evidence:** only collection-level `functions/api/breaks.ts` exists;
frontend expects per-break extend and complete operations.

**Required endpoints:** - `GET /api/v1/breaks` - `POST /api/v1/breaks` -
`PATCH /api/v1/breaks/:id/extend` - `POST /api/v1/breaks/:id/complete`
or consistent PATCH status endpoint. - Optional DELETE only for
owner/admin. - Validate ownership, active status, expiry, duration and
campus/location. - Use server timestamps. - Avoid duplicate active
records via database/application constraints.

## FUNC-007 --- Registration returns an apparent session before approval

**Evidence:** `functions/api/auth/register.ts` returns a generated token
and user object after creating a pending account.

**Required:** Registration should create a pending user but should not
create a fully authenticated member session. If a limited pending
session is needed, it must have a restricted scope that can only read
approval status and sign out. Pending users must not access directory,
breaks, chat, profiles of others or admin endpoints.

## FUNC-008 --- Registration does not fully validate campus and input

**Evidence:** registration accepts `campusId`, `roleTitle`, interests,
dietary and icebreaker from the client with limited checks.

**Required:** - Validate email syntax and normalize. - Validate employee
ID format and uniqueness with database unique constraints. - Verify
campus exists and is active. - Enforce field length limits and allowed
enumerations. - Prevent role/status assignment from the client. - Add
anti-bot protection and rate limiting. - Consider whether employee
email-domain verification is required; do not assume a domain alone
proves employment.

## FUNC-009 --- Database schema creation is performed during request handling

**Evidence:** `functions/db.ts` exports `ensureD1Schema()` and many
request handlers invoke it. The function dynamically creates tables/adds
columns and swallows DDL failures. It also uses module-level
`isSchemaEnsured`.

**Risk:** schema state is unclear across isolates/deployments; requests
can race; failed migrations can be hidden; runtime requests carry
schema-management responsibilities.

**Required:** 1. Use versioned SQL migrations committed to repository.
2. Apply migrations through Wrangler/CI deployment workflow, not every
request. 3. Add a migration ledger table and deterministic migration
ordering. 4. Fail deployment if a migration fails. 5. Do not swallow
migration errors. 6. Keep runtime code limited to application queries.
7. Add staging migration and rollback/recovery documentation. 8. Remove
`isSchemaEnsured` as a substitute for proper migration management.

## FUNC-010 --- Multiple competing backend implementations

**Evidence:** repository includes: - Cloudflare Pages Functions in
`functions/api`. - Express implementation in `server.ts`. - Browser
localStorage data service in `src/services/storage.ts`.

**Risk:** endpoints and behaviour differ depending on execution
environment. Express routes may give a false impression that a
Cloudflare endpoint is implemented.

**Required:** - Cloudflare Worker API must be the sole production
backend. - Express should either be removed or clearly isolated as a
local-only development adapter that invokes the same application service
layer. - Frontend should call one API client and never silently fall
back to local demo data in production. - Add environment-specific guards
to prevent demo data in production.

------------------------------------------------------------------------

# 5. Product workflows to preserve and implement

The following are intended product capabilities from the UI and
implementation plan. Gemini must inspect the current components and
preserve useful visual design while making each workflow genuinely
server-backed.

## 5.1 Public/unauthenticated experience

-   Landing page and product information.
-   Responsive navigation.
-   Registration entry point.
-   Sign-in entry point.
-   Clear privacy, terms and safety links.
-   No private member data before authentication.

## 5.2 Registration and approval

1.  Visitor opens registration.
2.  Enters full name, work email, employee identifier, campus,
    designation and required profile fields.
3.  Client and server validate all fields.
4.  Server creates pending account with password hash.
5.  No unrestricted member session is issued.
6.  User sees pending approval status.
7.  Campus admin sees applicant only for their campus.
8.  Admin approves or rejects with optional reason.
9.  Approval creates an audit event and notification.
10. Approved user signs in and gains member permissions.

Test duplicates, invalid input, missing campus, rejected re-application
policy, race conditions and repeated submission.

## 5.3 Login/logout/session

-   Valid credentials create secure session.
-   Invalid credentials return generic error.
-   Pending/rejected/suspended accounts receive correct restricted
    response.
-   Logout revokes session server-side and clears cookie.
-   Expired/revoked session cannot be reused.
-   Session rotation after login and privilege changes.
-   `/me` returns actual server-side identity.
-   Browser refresh must not lose a valid session.

## 5.4 Member profile and interests

-   View own profile.
-   Edit permitted profile fields.
-   Set interests, dietary preference, social battery and icebreaker.
-   View another approved member's limited public profile.
-   Never expose email/employee ID unless explicitly required and
    authorized.
-   Profile updates persist across devices.
-   Input is length-limited and sanitized.

## 5.5 Campus and location

-   List active campuses available to user.
-   Switch campus only if membership/authorization permits.
-   View active locations within selected campus.
-   Admin create/edit/archive location.
-   Admin cannot modify locations outside assigned campus.
-   Deleting/archiving campus must follow retention and
    referential-integrity rules.
-   No hardcoded campus list as production source of truth.

## 5.6 Break board

-   Filter by tea, lunch, walk and campus.
-   Show only approved/active members' non-expired posts.
-   Create break with valid duration and location.
-   Edit/extend only own active break.
-   Complete/cancel only own active break unless authorized admin.
-   Expiry works after time passes and across timezone changes.
-   No stale break should appear.
-   Prevent spam and excessive active posts.
-   Empty/error/loading states are distinct.

## 5.7 Connect, meetup and chat

The implementation plan promises one-tap connect and coordination chat.
The current backend does not contain a complete, secure meetup/ping
lifecycle.

Implement a defined lifecycle: - Member A sends ping to Member B. -
Recipient can accept/decline. - Both participants are associated with a
conversation. - Only participants can read/send messages. - Either
participant can leave/block/report. - Blocked users cannot initiate new
communication. - Message ordering, pagination and duplicate
prevention. - Rate limits and message length limits. - Conversation and
message retention policy.

## 5.8 Notifications

-   Approval/rejection notification.
-   Meetup ping received/accepted/declined.
-   New message.
-   Break expiry reminder if product chooses.
-   Mark read/unread.
-   Notification belongs to recipient.
-   Do not leak another user's notification by changing a user ID in
    request.

## 5.9 Admin dashboard

-   Pending approval queue.
-   Member directory with campus/status filters.
-   Approve/reject.
-   Suspend/reinstate.
-   Role management with platform-admin restriction.
-   Campus and location management.
-   Reports/moderation queue.
-   Audit log.
-   Search, pagination and loading/error states.
-   Confirm destructive operations.
-   Enforce permissions in backend, not merely by hiding buttons.

## 5.10 Account and privacy

-   Change password.
-   Reset password securely.
-   Logout all sessions.
-   Delete/deactivate account.
-   Export personal data where applicable.
-   Privacy controls for profile visibility.
-   Block/report user.
-   Clear data retention and account deletion policy.
-   Do not use real company employee data in development/demo fixtures.

------------------------------------------------------------------------

# 6. Target production architecture

## 6.1 Architecture decision

Use a **Cloudflare-native modular monolith**, not microservices, for the
first 10,000-user target.

This is simpler to deploy, cheaper to operate and easier to maintain.
Organize code into domain modules so services can be extracted later if
real load justifies it.

Recommended structure:

``` text
midday-buddy/
  src/
    app/
    components/
    pages/
    features/
      auth/
      profiles/
      campuses/
      locations/
      breaks/
      meetups/
      chat/
      notifications/
      admin/
      moderation/
    services/
      api-client.ts
      session.ts
    hooks/
    styles/
    types/
  worker/
    index.ts
    middleware/
      auth.ts
      authorization.ts
      rate-limit.ts
      request-id.ts
      error-handler.ts
      csrf.ts
    modules/
      auth/
      users/
      profiles/
      campuses/
      locations/
      breaks/
      meetups/
      chat/
      notifications/
      admin/
      moderation/
      audit/
    lib/
      db.ts
      validation.ts
      password.ts
      session.ts
  migrations/
    0001_initial.sql
    0002_indexes.sql
    ...
  tests/
    unit/
    integration/
    e2e/
    security/
  docs/
    architecture.md
    api-openapi.yaml
    data-dictionary.md
    runbooks/
  scripts/
    seed-development.ts
    create-first-admin.ts
  .github/workflows/
    ci.yml
  package.json
  tsconfig.json
  vite.config.ts
  wrangler.jsonc
  README.md
```

## 6.2 Technology

  -----------------------------------------------------------------------
  Layer                               Preferred technology
  ----------------------------------- -----------------------------------
  Frontend                            React + TypeScript + Vite

  UI                                  Existing Tailwind/Lucide design,
                                      refactored

  Hosting                             Cloudflare Workers Static Assets

  API                                 Cloudflare Workers, TypeScript

  Database                            Cloudflare D1 initially

  Auth                                Server-side D1 sessions + secure
                                      cookies

  Validation                          Zod

  API contract                        OpenAPI 3.1

  Real-time                           Durable Objects/WebSockets only
                                      when needed

  File uploads                        R2 only when feature requires it

  Background work                     Queues/cron only where needed

  Unit tests                          Vitest

  Worker tests                        Cloudflare Workers test tooling /
                                      Miniflare-compatible setup

  Browser tests                       Playwright

  CI                                  GitHub Actions

  Observability                       Cloudflare Workers
                                      Logs/Observability, structured
                                      application logs
  -----------------------------------------------------------------------

Do not add paid dependencies or services by default. Verify current
Cloudflare Free plan quotas before promising capacity. Free quotas and
product terms can change. ₹0/month is a target under quotas, not a
guarantee under arbitrary traffic or usage.

## 6.3 Request flow

``` text
Browser / PWA
   |
   | HTTPS
   v
Cloudflare Workers Static Assets
   |
   v
/api/v1/* Worker router
   |
   +--> Request ID + security headers
   +--> Origin/CSRF validation
   +--> Session authentication
   +--> Role + campus authorization
   +--> Zod input validation
   +--> Domain service
   |
   +--> D1 prepared statements
   +--> Optional R2 for files
   +--> Optional Durable Object for live chat
   +--> Optional Queue for async jobs
```

## 6.4 Multi-campus tenancy

A user may belong to one or more campuses if product rules require it.
Model campus membership explicitly. Do not rely only on
`users.campus_id` if users can be multi-campus.

Every campus-scoped query must include authorized campus membership.
Every admin mutation must validate the admin's campus scope.

Use platform-admin and campus-admin roles, with explicit permissions
rather than a single boolean.

## 6.5 Database schema requirements

Create versioned migrations. At minimum include these tables:

-   `users`
-   `profiles`
-   `sessions`
-   `password_reset_requests` or `password_reset_tokens`
-   `campuses`
-   `campus_memberships`
-   `locations`
-   `interests`
-   `user_interests`
-   `break_posts`
-   `meetups`
-   `meetup_participants` if lifecycle requires it
-   `conversations`
-   `conversation_members`
-   `messages`
-   `notifications`
-   `user_blocks`
-   `user_reports`
-   `audit_events`
-   `idempotency_keys`
-   `schema_migrations`

Required indexes: - Unique normalized email. - Unique normalized
employee identifier where applicable. - Membership user/campus unique
pair. - Breaks by campus/status/expiry. - Messages by
conversation/created time. - Notifications by recipient/read/created
time. - Sessions by token hash and expiry. - Reset token hash and
expiry. - Audit events by campus/time and actor/time.

Use foreign keys and CHECK constraints for enums/status. Use
parameterized D1 statements only. Add pagination to all unbounded list
endpoints.

------------------------------------------------------------------------

# 7. API contract requirements

All new endpoints must use `/api/v1`. Do not mix legacy `/api` and
`/api/v1` in the new frontend.

Suggested endpoints:

## Auth

-   `POST /api/v1/auth/register`
-   `POST /api/v1/auth/login`
-   `POST /api/v1/auth/logout`
-   `POST /api/v1/auth/logout-all`
-   `GET /api/v1/auth/me`
-   `POST /api/v1/auth/forgot-password`
-   `POST /api/v1/auth/reset-password`
-   `POST /api/v1/auth/change-password`

## Profiles

-   `GET /api/v1/me/profile`
-   `PATCH /api/v1/me/profile`
-   `GET /api/v1/users/:userId/public-profile`

## Campus

-   `GET /api/v1/campuses`
-   `GET /api/v1/campuses/:campusId`
-   `POST /api/v1/admin/campuses`
-   `PATCH /api/v1/admin/campuses/:campusId`
-   `DELETE /api/v1/admin/campuses/:campusId` (prefer
    archive/deactivate)

## Locations

-   `GET /api/v1/campuses/:campusId/locations`
-   `POST /api/v1/admin/campuses/:campusId/locations`
-   `PATCH /api/v1/admin/locations/:locationId`
-   `DELETE /api/v1/admin/locations/:locationId`

## Member administration

-   `GET /api/v1/admin/users`
-   `GET /api/v1/admin/pending-users`
-   `POST /api/v1/admin/users/:userId/approve`
-   `POST /api/v1/admin/users/:userId/reject`
-   `PATCH /api/v1/admin/users/:userId/status`
-   `PATCH /api/v1/admin/users/:userId/role`

## Breaks

-   `GET /api/v1/breaks`
-   `POST /api/v1/breaks`
-   `PATCH /api/v1/breaks/:breakId`
-   `POST /api/v1/breaks/:breakId/complete`
-   `DELETE /api/v1/breaks/:breakId`

## Meetups and chat

-   `POST /api/v1/meetups`
-   `GET /api/v1/meetups`
-   `POST /api/v1/meetups/:meetupId/accept`
-   `POST /api/v1/meetups/:meetupId/decline`
-   `GET /api/v1/conversations`
-   `GET /api/v1/conversations/:conversationId/messages`
-   `POST /api/v1/conversations/:conversationId/messages`

## Notifications

-   `GET /api/v1/notifications`
-   `POST /api/v1/notifications/:notificationId/read`
-   `POST /api/v1/notifications/read-all`

## Moderation and audit

-   `POST /api/v1/reports`
-   `GET /api/v1/admin/reports`
-   `POST /api/v1/admin/reports/:reportId/resolve`
-   `GET /api/v1/admin/audit-events`

For every endpoint specify: - Authentication required? - Allowed
roles? - Campus scope? - Request schema. - Response schema. - Error
status codes. - Rate limit. - Idempotency requirement for sensitive
operations. - Audit requirement.

Use consistent JSON:

``` json
{
  "data": {},
  "meta": {
    "requestId": "server-generated-id"
  }
}
```

For errors:

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be validated.",
    "details": []
  },
  "meta": {
    "requestId": "server-generated-id"
  }
}
```

Never expose stack traces, SQL errors, password hashes, tokens or
internal secrets.

------------------------------------------------------------------------

# 8. Performance and 10,000-user scalability requirements

10,000 registered users does not mean 10,000 simultaneous users. Gemini
must design for a realistic concurrency model and measure it.

## Required performance work

1.  Remove the four-second global polling loop in `src/App.tsx` (around
    line 185).
2.  Poll only data that cannot be pushed; use sensible refresh intervals
    and exponential backoff.
3.  Stop polling when the tab is hidden or the user is logged out.
4.  Use WebSockets/ Durable Objects only for genuinely real-time
    features and only after quota/cost review.
5.  Paginate member lists, messages, audit logs and notifications.
6.  Add indexes for common filters and sort orders.
7.  Avoid `SELECT *`; select only required columns.
8.  Add cache headers only to non-sensitive public/static data.
9.  Never publicly cache private member data or personalized API
    responses.
10. Add request size and message size limits.
11. Debounce search.
12. Prevent N+1 database queries.
13. Use cursor pagination for chat/message feeds.
14. Add rate limits for login, registration, reset, chat, meetup and
    admin actions.
15. Add idempotency for create/approve/payment-like future actions.
16. Measure D1 rows read/written and Worker CPU per request.

## Load-test scenarios

Run tests against staging, not production: - 10 virtual users: smoke. -
50 concurrent users: baseline. - 100 concurrent users: target initial
concurrency. - 250 concurrent users: burst. - 500 concurrent users:
exploratory stress test if free quotas allow. - 1,000 concurrent users:
optional only in a controlled environment; monitor quota and do not
assume free tier supports it.

Use k6 or equivalent. Do not generate a test that unintentionally
exceeds free-tier quotas or causes account suspension.

Suggested initial acceptance targets (measure and revise based on real
usage): - p95 read API latency under 500 ms in staging for normal
queries. - p95 write API latency under 800 ms in staging. - 5xx rate
below 1% during target load. - No cross-tenant data leakage. - No
duplicate approvals/meetups under retry. - No unbounded query results. -
No memory/CPU spikes or runaway polling. - All quota usage visible and
alertable.

These are targets, not measured claims.

------------------------------------------------------------------------

# 9. Full QA test plan

Gemini must create automated tests with stable test fixtures. Use a
dedicated staging database and test accounts. Never use real employee
personal information.

## 9.1 Authentication tests

-   Register with valid data.
-   Missing required fields.
-   Invalid email.
-   Duplicate normalized email.
-   Duplicate employee identifier.
-   Invalid/inactive campus.
-   Too-short/too-long password.
-   Common/breached password policy.
-   Rate-limited registration.
-   Bot challenge failure.
-   Login success.
-   Wrong password.
-   Unknown email generic response.
-   Pending user login restriction.
-   Rejected user restriction.
-   Suspended user restriction.
-   Logout revokes session.
-   Expired session rejected.
-   Random Bearer token rejected.
-   Revoked token rejected.
-   Session rotation.
-   Cookie flags verified.
-   CSRF protection verified.
-   Password reset request generic response.
-   Reset token expired.
-   Reset token reused.
-   Reset token for another user.
-   Password reset revokes existing sessions.
-   Change password requires current credential/session.
-   Logout-all revokes all sessions.

## 9.2 Authorization/security tests

-   Anonymous user cannot access member endpoints.
-   Pending user cannot view break board.
-   Pending user cannot read profiles.
-   Pending user cannot chat.
-   Suspended user cannot mutate resources.
-   Member cannot call admin routes.
-   Campus admin cannot manage another campus.
-   Campus admin cannot promote platform admin.
-   Caller cannot forge user ID.
-   Caller cannot forge role.
-   Caller cannot forge status.
-   Caller cannot forge audit actor.
-   User A cannot read User B private profile.
-   User A cannot update User B profile.
-   User A cannot complete User B break.
-   Nonparticipant cannot read conversation.
-   Nonparticipant cannot post chat message.
-   Blocked user cannot initiate meetup/chat.
-   SQL injection payloads handled safely.
-   XSS payloads safely rendered/escaped.
-   CSRF test.
-   CORS untrusted origin test.
-   Rate-limit test.
-   Oversized body rejected.
-   Unknown API route returns 404.
-   Unsupported method returns 405.
-   Secrets absent from frontend build and logs.

## 9.3 Profile tests

-   Profile loads from server.
-   Allowed fields update.
-   Forbidden fields ignored/rejected.
-   Interest selection persists.
-   Empty bio allowed if optional.
-   Maximum lengths enforced.
-   Another member's public profile only shows allowed fields.
-   Changes persist after logout/login and on another device.

## 9.4 Campus/location tests

-   Campus list is correct.
-   Campus membership scope enforced.
-   Create campus by platform admin.
-   Create campus rejected for member.
-   Update own authorized campus.
-   Cross-campus update rejected.
-   Add location.
-   Edit location.
-   Archive/delete location.
-   Duplicate slug rejected.
-   Invalid campus reference rejected.
-   Campus archive does not leave visible orphan breaks.
-   Audit event created.

## 9.5 Break tests

-   Create tea break.
-   Create lunch break.
-   Create walk break.
-   Invalid type rejected.
-   Invalid duration rejected.
-   Invalid location rejected.
-   User cannot post as another user.
-   Pending user cannot post.
-   Suspended user cannot post.
-   Extend own break.
-   Cannot extend another user's break.
-   Complete own break.
-   Cannot complete another user's break.
-   Expired break hidden.
-   Expired break cannot be extended.
-   Duplicate/rapid submissions handled idempotently.
-   Campus filtering works.
-   Pagination and sorting work.
-   Empty state and backend error state differ.

## 9.6 Meetup/chat tests

-   Send ping.
-   Accept ping.
-   Decline ping.
-   Duplicate ping handled.
-   Only participants can view meetup.
-   Only participants can message.
-   Sender identity comes from session.
-   Message length enforced.
-   Message ordering correct.
-   Pagination/cursor correct.
-   Blocked users cannot communicate.
-   Suspended users cannot communicate.
-   Notification emitted for recipient.
-   Connection loss/reconnect behaviour.
-   No duplicate messages on retry.

## 9.7 Notifications/audit tests

-   Correct recipient receives notification.
-   Other user cannot read it.
-   Mark one read.
-   Mark all read.
-   Unread count accurate.
-   Audit event created for privileged action.
-   Audit actor is server-derived.
-   Audit event cannot be edited/deleted by normal API.
-   Sensitive data not recorded.
-   Pagination and filters work.

## 9.8 UI/responsive/accessibility tests

-   Desktop 1440px, laptop 1280px.
-   Tablet 768px.
-   Mobile 390px and 360px.
-   Very narrow 320px sanity test.
-   No horizontal overflow.
-   Navigation works on touch.
-   Modal focus trap and Escape behaviour.
-   Keyboard navigation.
-   Visible focus indicators.
-   Form labels and error association.
-   Colour contrast.
-   Screen-reader labels for icon-only controls.
-   Loading, empty, success and error states.
-   Refresh/deep links work.
-   Offline/network interruption is handled.
-   Browser back/forward works.
-   No console errors or failed network calls.

## 9.9 Reliability/performance tests

-   D1 unavailable.
-   D1 constraint failure.
-   Slow API response.
-   Network timeout.
-   Repeated request/retry.
-   Worker exception.
-   Large list pagination.
-   Concurrent registration with same email.
-   Concurrent approval.
-   Concurrent meetup accept/decline.
-   Burst traffic.
-   Quota monitoring.
-   Restore from backup procedure.
-   Deploy rollback procedure.

------------------------------------------------------------------------

# 10. Required automated quality gates

Add package scripts and CI checks. Adjust versions to the actual package
lock and Cloudflare runtime compatibility.

Suggested scripts:

``` json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "check": "npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

CI should: 1. Install dependencies from lockfile. 2. Run
formatting/lint. 3. Run TypeScript check. 4. Run unit tests. 5. Run
migration tests against local D1/SQLite-compatible test environment. 6.
Run API integration tests. 7. Build production frontend/Worker. 8. Run
Playwright E2E in staging or local Worker environment. 9. Run dependency
vulnerability audit. 10. Block deployment on failed checks. 11. Deploy
staging automatically only after checks pass. 12. Require explicit
approval for production deployment.

Do not use a test command that silently succeeds when no tests are
discovered.

------------------------------------------------------------------------

# 11. Cloudflare deployment and zero-budget operating plan

## Environments

-   Local development: local D1 database and demo fixtures.
-   Staging: separate Cloudflare Worker and separate D1 database.
-   Production: separate Worker and production D1 database.

Never share staging and production database IDs or secrets.

## Cloudflare configuration

Use `wrangler.jsonc` (or the current supported Wrangler config format)
for: - Worker entry point. - Static assets binding. - D1 database
binding. - Environment-specific D1 database IDs. - Environment variables
(non-secret). - Secrets via Wrangler secret management. - Compatibility
date. - Observability/logging settings.

Do not commit API tokens, passwords, private keys or secret values.

## Cost controls

-   Use free-tier services only while usage remains within current
    quotas.
-   Monitor requests/day, CPU, D1 rows read/written/storage, R2
    storage/operations and Durable Object usage.
-   Avoid adding Workers KV, R2, Queues or Durable Objects until the
    feature requires them.
-   Do not claim guaranteed unlimited or permanent zero cost.
-   Provide a quota-overrun plan: throttle, queue, degrade non-critical
    features or seek explicit approval before upgrading.
-   Add budget/quota dashboard and operational alerts where available.

## Backups and recovery

-   Document D1 export/backup process available under the selected plan.
-   Keep migration files in version control.
-   Test restore into a new staging database.
-   Document recovery point and recovery time objectives.
-   Do not treat source control as a database backup.

------------------------------------------------------------------------

# 12. Implementation sequence Gemini must follow

Gemini should implement incrementally and keep the project runnable at
each phase.

## Phase 0 --- Repository and baseline

1.  Inspect every source file and the current UI.
2.  Map all UI actions to API functions.
3.  Produce route matrix and schema mapping.
4.  Run current build/typecheck/tests and record baseline failures.
5.  Do not make visual redesign changes unless necessary for
    responsive/accessibility fixes.
6.  Create a backup branch or clearly preserve original source.

**Exit criteria:** inventory, baseline commands/results, no unexplained
route.

## Phase 1 --- Remove unsafe legacy behaviour

1.  Remove hardcoded admin credentials from all source.
2.  Remove browser-seeded admin and fake production users.
3.  Remove plaintext password fields and comparisons.
4.  Remove fake Bearer token authentication.
5.  Remove localStorage as source of truth for protected data.
6.  Replace catch-all 200 with correct 404/405.
7.  Disable old unsafe admin/reset/chat/break endpoints until secure
    replacement is ready.

**Exit criteria:** static scan finds no hardcoded credentials, no
plaintext password persistence, no fake auth bypass.

## Phase 2 --- Database and Worker foundation

1.  Establish a single Cloudflare Worker API architecture.
2.  Create versioned D1 migrations.
3.  Implement typed D1 access layer.
4.  Add request ID, error handling, validation and security headers.
5.  Add environment config for local/staging/production.
6.  Add migration CI.
7.  Remove runtime schema self-healing.

**Exit criteria:** clean migration succeeds on empty staging DB; Worker
health endpoint reports database connectivity accurately.

## Phase 3 --- Identity and authorization

1.  Implement password hashing.
2.  Implement server-side sessions.
3.  Implement secure cookies and CSRF.
4.  Implement auth middleware.
5.  Implement RBAC and campus scope.
6.  Implement registration/pending approval.
7.  Implement password reset/change.
8.  Implement admin bootstrap safely.
9.  Add comprehensive security tests.

**Exit criteria:** all SEC-001 through SEC-012 fixed and tests pass.

## Phase 4 --- Core application

Implement profile, campus, location, break, meetup, chat, notification
and admin workflows. Each module must include: - Database migration if
required. - Service and API handler. - Zod validation. -
Authorization. - Unit tests. - Integration tests. - Frontend
integration. - Loading/empty/error states. - Audit events where
appropriate.

**Exit criteria:** no visible action is a dead button or fake success.

## Phase 5 --- Performance and reliability

-   Remove four-second global polling.
-   Add pagination and indexes.
-   Add backoff and visibility-aware refresh.
-   Add request limits and rate limits.
-   Add monitoring and structured logs.
-   Add k6 tests.
-   Review quotas.

**Exit criteria:** documented performance results under agreed staging
load.

## Phase 6 --- E2E, accessibility and launch

-   Playwright workflows for all roles.
-   Mobile responsive tests.
-   Accessibility checks.
-   Security regression suite.
-   Backup/restore drill.
-   Staging sign-off.
-   Production deployment with rollback plan.

**Exit criteria:** all P0/P1 issues closed; no critical workflow
failures; test report signed off.

------------------------------------------------------------------------

# 13. Acceptance criteria --- definition of done

The application must not be declared production-ready until:

-   [ ] No hardcoded production credentials.
-   [ ] No plaintext password storage.
-   [ ] Password reset is secure, persisted and single-use.
-   [ ] Every protected API validates server session.
-   [ ] Every admin API enforces role and campus scope.
-   [ ] User identity is never trusted from request body.
-   [ ] Unknown API route returns 404.
-   [ ] Unsupported method returns 405.
-   [ ] No fake success endpoints remain.
-   [ ] Every frontend API call has a real backend route.
-   [ ] No private data is sourced from localStorage.
-   [ ] D1 migrations are versioned and tested.
-   [ ] All user-facing actions persist correctly.
-   [ ] Chat and meetup membership is enforced.
-   [ ] Notifications and audit logs are persisted.
-   [ ] Pagination and database indexes exist.
-   [ ] Mobile layout passes target viewport tests.
-   [ ] Keyboard and accessibility checks completed.
-   [ ] Unit and integration tests pass.
-   [ ] Playwright critical workflows pass.
-   [ ] Security regression tests pass.
-   [ ] Load test results documented.
-   [ ] Backup/restore test completed.
-   [ ] Staging and production are isolated.
-   [ ] Rollback procedure documented.
-   [ ] No unresolved P0 or P1 issues.
-   [ ] Actual test evidence is included in final report.

------------------------------------------------------------------------

# 14. Instructions to Gemini Studio AI --- execute the changes

**Copy this instruction together with this report and the full source
ZIP:**

> You are the lead software architect, senior Cloudflare Workers
> engineer, application security engineer and QA automation engineer
> responsible for upgrading MidDay Buddy to production quality.
>
> I have provided: 1. The complete existing MidDay Buddy source project
> ZIP. 2. This detailed source validation and implementation change
> report.
>
> My product decisions: - Target: 10,000 registered users in the first
> year. - Initial infrastructure budget: ₹0/month. - Hosting: Cloudflare
> ecosystem. - Approach: rebuild the backend and production
> architecture; preserve and refactor the useful existing React UI.
>
> **Your task is to modify the actual project source files. Do not
> merely explain what should be changed, generate another plan, or
> provide isolated code snippets.**
>
> Mandatory working rules:
>
> 1.  Inspect the complete repository before modifying it. Do not assume
>     a file or endpoint exists.
> 2.  Preserve the current MidDay Buddy brand, core product concept and
>     useful visual design. Improve responsive behaviour and
>     accessibility without unnecessarily replacing the UI.
> 3.  Treat every P0/P1 finding in this report as a blocker.
> 4.  Build one authoritative Cloudflare Workers backend and one
>     authoritative D1 database model. Remove conflicting production
>     behaviour from Express and localStorage.
> 5.  Implement server-side authentication, secure password hashing,
>     secure sessions, RBAC and campus-level authorization before
>     implementing privileged business features.
> 6.  Use versioned D1 SQL migrations, not runtime schema creation.
> 7.  Implement all required API endpoints and connect every UI action
>     to a real backend operation.
> 8.  Do not use mock data, fake success responses or placeholder
>     handlers in production. Development fixtures must be explicitly
>     development-only.
> 9.  Never trust user ID, admin ID, role, approval status or sender
>     identity from the client.
> 10. Use Cloudflare-compatible libraries and verify CPU/runtime
>     constraints. Do not introduce paid services without approval.
> 11. Do not claim a feature works until the associated test has
>     actually passed.
> 12. Work in small phases. After each phase, run typecheck, tests and
>     build, then report exact results.
> 13. If a required Cloudflare binding, account credential or external
>     service is unavailable, create the correct configuration and
>     document the exact manual setup. Never invent secrets or claim
>     deployment succeeded.
> 14. Keep production data isolated. Do not run destructive migrations
>     against an existing production database.
> 15. Do not copy legacy plaintext passwords into the new database.
>     Require password reset/re-enrolment for legacy accounts.
>
> **Execution order:** - First: repository inventory and baseline test
> report. - Second: security containment and remove hardcoded
> credentials/fake auth. - Third: new D1 schema and migrations. -
> Fourth: Worker API, auth, sessions, RBAC and campus authorization. -
> Fifth: profiles, campus, locations, breaks, meetups, chat,
> notifications, admin and audit. - Sixth: frontend integration. -
> Seventh: unit, API integration, Playwright, security, accessibility
> and load tests. - Eighth: staging deployment guide and production
> release checklist.
>
> **Required deliverables:** - Complete modified project source, not
> just code samples. - Updated package scripts and lockfile if
> dependencies change. - Cloudflare Worker configuration. - All D1
> migration SQL files. - OpenAPI API documentation. - `.env.example`
> with variable names only and no secrets. - Automated unit, integration
> and E2E test suites. - CI workflow. - README with exact local setup,
> migration, staging and deployment commands. - Updated architecture and
> security documentation. - `VALIDATION_REPORT.md` with each finding
> marked FIXED, NOT FIXED or NOT TESTED. - `TEST_RESULTS.md` with exact
> commands, pass/fail counts, environment and evidence. -
> `DEPLOYMENT_RUNBOOK.md` with staging, production, rollback and
> backup/restore instructions.
>
> Do not stop after producing the plan. Continue modifying the files
> until the available implementation and validation work is complete. If
> context or execution limits prevent completion, clearly state the
> exact completed phase, remaining files/tasks and next command. Never
> mark incomplete work as production-ready.
>
> **Final acceptance:** The project must build, the automated tests must
> run, all critical user workflows must be connected to real backend
> operations, and no P0/P1 security finding may remain unresolved.
> Report any tests that could not be executed honestly.

------------------------------------------------------------------------

# 15. Final recommendation

Do not ask Gemini to "make the website more professional" or "fix all
bugs" as a single vague request. Give it the source ZIP and this report,
then require phase-by-phase implementation with actual file edits and
test evidence.

**Most important priority:** secure authentication and authorization
first. A polished interface with an insecure backend is not a production
product.

**Release status based on this source review: NOT APPROVED for
unrestricted public launch.** Reassess only after the implementation and
runtime validation criteria above have been completed.
