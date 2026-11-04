# MidDay Buddy – Production-Ready Zero-Cost Prototype Architecture

An attractive, secure, and low-friction midday break companion platform for TCS Siruseri and multi-campus environments. This plan incorporates mandatory **manual admin approval for all user registrations**, a dedicated **Admin Dashboard** for community moderators, and a verified **100% zero-cost prototype deployment** utilizing Cloudflare Pages, Workers, D1 (SQLite), and real-time Server-Sent Events / WebSocket hibernation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Key Refinements Incorporated**:
> 1. **Manual User Approval by Admin**: All newly registered users enter a `pending_approval` state. They see a welcoming "Pending Approval" status screen and cannot access live break boards, post availability, or message others until verified and approved by a campus administrator.
> 2. **Comprehensive Admin Dashboard (`/admin`)**:
>    - **Pending Approvals Queue**: Review applicants (name, employee email, designation, campus community) with 1-click **Approve** and **Reject**.
>    - **User Directory & Moderation**: View all members, search by name/email, toggle active/suspended status, and review flagged reports.
>    - **Campus & Location Manager**: Configure rendezvous landmarks (Central Spine kiosks, Food Courts, Lawn Gazebo).
>    - **Audit Log**: Immutable audit trail of approvals, rejections, and suspensions.
> 3. **Guaranteed 100% Zero-Cost Prototype Architecture**:
>    - **Cloudflare Pages**: 100% Free (Unlimited bandwidth, global edge caching, SSL, custom domain).
>    - **Cloudflare Workers**: 100% Free (100,000 requests/day, 10ms CPU/req).
>    - **Cloudflare D1 (Relational SQL)**: 100% Free (5 Million read rows/day, 100,000 write rows/day, 5 GB storage).
>    - **Real-Time Presence & Chat**: Implemented using **Server-Sent Events (SSE)** and **Cloudflare Worker WebSocket Hibernation** on the free tier—completely avoiding paid $5/mo Durable Objects add-ons while delivering real-time pings and instant chat.
>    - **Turnstile Bot Protection**: 100% Free tier for login and registration verification.

- **Product Name**: **MidDay Buddy**
- **Security Posture**: Invite & Admin-Approved Registration (Zero unverified strangers on campus boards)
- **Deployment Cost**: **$0.00 / month** (Guaranteed on Cloudflare Free Tier)
- **Initial Pilot**: TCS Siruseri Central Spine (Dynamically seeded in D1)

---

## 1. Overview & Core Concept

### What It Does
MidDay Buddy connects campus colleagues for spontaneous, midday breaks (tea/coffee walks, cafeteria lunches, outdoor strolls, and games) with zero scheduling overhead and maximum safety:
1. **Curated & Safe Community**: Anyone can register, but an admin must review and approve their account before they can see other colleagues or participate.
2. **Instant Break Board**: Once approved, employees view real-time break availability along the Siruseri Central Spine:
   - ☕ **Tea Break** (10–15 min quick chai/coffee walk)
   - 🍱 **Lunch Break** (30–45 min meal at FC1, FC2, or kiosks)
3. **Instant Interest Pop-up**: Tap any profile card to inspect shared hobbies (Badminton, GenAI, Cinema, Reading), dietary vibe, and an icebreaker topic.
4. **1-Tap Connect & Live Chat**: Send a greeting ping and open an instant coordination chat drawer to meet up ("Meet at Spine Chai Point in 3 mins").

---

## 2. Admin Approval & Moderation Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                   USER REGISTRATION & APPROVAL FLOW                    │
└────────────────────────────────────────────────────────────────────────┘

  [ New Employee ] ──> Submits Registration (Email, Name, Campus, Role)
                             │
                             ▼
  [ Database (D1) ] ──> status: 'pending_approval'
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
  [ User Experience ]                [ Admin Dashboard ]
  Displays friendly banner:          Appears in "Pending Queue"
  "Your account is awaiting          Admin reviews role & campus
  campus admin approval. You will    Clicks [ Approve ] or [ Reject ]
  be notified once verified."                 │
            │                                 │
            └────────────────┬────────────────┘
                             ▼
  [ Database (D1) ] ──> status: 'approved'
  User unlocked: Accesses Live Break Board, Interest Popups, & Instant Chat
```

### Admin Dashboard Modules (`/admin`)
1. **Pending Approvals Queue**: Card & table list of pending applicants. Shows employee name, email, role, campus selection, and date requested. Actions: `[ Approve ]`, `[ Reject ]`, `[ Request More Info ]`.
2. **Active Members Directory**: Searchable list of all approved users. Allows filtering by campus and one-click `[ Suspend ]` / `[ Reinstate ]`.
3. **Campus Landmarks & Spots**: Admin editor for adding or modifying meetup spots along the Central Spine and food courts.
4. **Abuse & Report Triage**: Review user reports with reported reason, context, and immediate action (`[ Dismiss ]`, `[ Warn ]`, `[ Ban ]`).
5. **Security Audit Log**: Immutable record of which admin approved or suspended which user with timestamps.

---

## 3. Database Schema (Cloudflare D1 - Zero-Cost SQLite)

```sql
-- 1. Users (with Mandatory Approval Status)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'community_admin', 'platform_admin')),
  status TEXT DEFAULT 'pending_approval' CHECK(status IN ('pending_approval', 'approved', 'rejected', 'suspended')),
  rejection_reason TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);

-- 2. Profiles (Display Identity)
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_seed TEXT NOT NULL,
  role_title TEXT NOT NULL,                  -- e.g. "Software Engineer", "Systems Analyst"
  campus_id TEXT NOT NULL REFERENCES communities(id),
  bio TEXT,
  icebreaker_prompt TEXT,
  dietary_pref TEXT DEFAULT 'Any',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 3. Communities (Multi-Campus Hubs)
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,                 -- 'siruseri-campus'
  name TEXT NOT NULL,                        -- 'TCS Siruseri Campus'
  city TEXT NOT NULL,                        -- 'Chennai'
  description TEXT,
  created_at INTEGER NOT NULL
);

-- 4. Locations (Central Spine & Dining Hotspots)
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- 'Spine Chai Point (Near Core)'
  zone TEXT NOT NULL,                        -- 'Central Spine', 'Food Court 1', 'FC2'
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 5. Interests Taxonomy & Mapping
CREATE TABLE interests (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE user_interests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_id TEXT NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, interest_id)
);

-- 6. Live Spontaneous Break Availability
CREATE TABLE active_breaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  break_type TEXT NOT NULL CHECK(break_type IN ('tea', 'lunch', 'walk')),
  location_id TEXT REFERENCES locations(id),
  custom_note TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'connected', 'expired')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_breaks_comm_status ON active_breaks(community_id, status);

-- 7. Instant Meetup Pings & Ephemeral Chat
CREATE TABLE meetups (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id),
  break_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  meetup_id TEXT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_chat_meetup ON chat_messages(meetup_id, created_at);

-- 8. Audit Logs (Admin Actions)
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,                      -- 'APPROVE_USER', 'REJECT_USER', 'SUSPEND_USER'
  target_user_id TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at INTEGER NOT NULL
);
```

---

## 4. Zero-Cost Technical Architecture & API Specifications

```
┌────────────────────────────────────────────────────────────────────────┐
│                     100% FREE PROTOTYPE RUNTIME                        │
└────────────────────────────────────────────────────────────────────────┘

  [ Client: React 19 + Tailwind v4 + Lucide ]
  ├── Break Board: Live Tea & Lunch feeds along Central Spine
  ├── Interest Pop-up: 1-click modal with icebreakers and passions
  ├── Status Banner: Pending approval view or "I'm Free" toggle
  ├── Admin Console: Approvals queue, Member management, Spot manager
  └── Instant Chat: Ephemeral slide-over coordination drawer
              │
              ▼ HTTPS / SSE Stream (100k free req/day)
  [ Server: Cloudflare Workers (TypeScript) ]
  ├── Auth Middleware: Session validation & 'approved' role gatekeeper
  ├── /api/auth/register       (Creates user in 'pending_approval' state)
  ├── /api/auth/login          (Issues session; checks approval status)
  ├── /api/buddies             (Returns active breaks - approved users only)
  ├── /api/status              (Publish spontaneous tea/lunch break)
  ├── /api/pings               (1-tap meetup request & response)
  ├── /api/chat/stream         (Server-Sent Events / WebSocket real-time chat)
  └── /api/admin/*             (Protected admin approval & moderation routes)
              │
              ▼ Prepared SQL (5M read rows/day, 5 GB storage free)
  [ Database: Cloudflare D1 (Serverless SQLite) ]
```

### API Endpoints for Admin & Approval
- `GET /api/v1/admin/pending-users`: Fetches applicants awaiting approval.
- `POST /api/v1/admin/users/:id/approve`: Changes status to `approved`, creates audit log, unlocks user.
- `POST /api/v1/admin/users/:id/reject`: Changes status to `rejected` with reason.
- `GET /api/v1/admin/users`: Full member directory with search and status filters.
- `PATCH /api/v1/admin/users/:id/status`: Suspend or reinstate member.
- `GET /api/v1/admin/audit-logs`: Immutable history of all administrative decisions.

---

## 5. UI/UX Hierarchy & Screen Workflows

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIEWPORT 1: BREAK BOARD                         │
├────────────────────────────────────────────────────────────────────────┤
│ ☕ MidDay Buddy · TCS Siruseri Spine     [ ⚡ I'm Free ]  [ 👤 Profile ]│
│                                                                        │
│ [ ☕ Tea Break (15m) ]    [ 🍱 Lunch Break (30m) ]   [ 🚶 Quick Walk ] │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 🟢 Dinesh Kumar · Systems Analyst                                  │ │
│ │ ☕ Spine Chai Point · Free Right Now (Next 15m)                     │ │
│ │ "Quick ginger tea walk before afternoon sprint"                    │ │
│ │ Badminton · GenAI · Cinema · Filter Coffee                         │ │
│ │ [ ⚡ Connect Now ]                         [ 🔍 View Interests ]   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                  VIEWPORT 2: ADMIN APPROVAL DASHBOARD                  │
├────────────────────────────────────────────────────────────────────────┤
│ 🛡️ Admin Portal · Siruseri Campus        [ Approvals (3) ] [ Members ] │
│                                                                        │
│ Pending User Approvals:                                                │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Priya Raman (priya.r@tcs.com) · Cloud Engineer                     │ │
│ │ Requested: Today at 12:45 PM · Campus: Siruseri Spine              │ │
│ │ Note: "Transferred from Kochi branch, looking for lunch buddies!"   │ │
│ │ [ ✅ Approve Member ]                  [ ❌ Reject Application ]   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Amit Sharma (amit.s@tcs.com) · Quality Analyst                     │ │
│ │ Requested: Today at 11:20 AM · Campus: Siruseri Spine              │ │
│ │ [ ✅ Approve Member ]                  [ ❌ Reject Application ]   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                   VIEWPORT 3: PENDING USER BANNER                      │
├────────────────────────────────────────────────────────────────────────┤
│ ⏳ Account Pending Approval                                           │
│ Thank you for joining MidDay Buddy! To keep the Siruseri campus       │
│ safe and trusted, an administrator reviews all new registrations.      │
│ We will activate your account shortly.                                 │
│ [ 🔄 Check Approval Status ]                    [ 🚪 Sign Out ]        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Deliverables
- [ ] **Dual-Role Navigation**: Seamless switching between Member view and Admin Portal for authorized administrators.
- [ ] **Pending Approval Interceptor**: Protected routes and UI states preventing unapproved users from viewing live feeds or sending messages.
- [ ] **Admin Approval Dashboard**:
  - Live queue of pending applicants with 1-click **Approve** and **Reject**.
  - Searchable member directory with **Suspend** / **Reinstate** controls.
  - Campus spot manager for Central Spine landmarks.
  - Audit trail viewer recording approval actions.
- [ ] **High-Aesthetic Member Experience**:
  - 1-click **Tea Break** and **Lunch Break** directory.
  - Smooth **Interest Pop-up Modal** with icebreakers, passions, and dietary vibes.
  - Instant **1-Tap Connect Ping** and real-time coordination chat drawer.
  - **"Broadcast My Break"** 5-second status modal.
- [ ] **100% Zero-Cost Deployment Blueprint**: Complete `wrangler.toml` and SQL migrations ready to deploy to Cloudflare free tier.
