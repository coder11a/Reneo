# Reneo Live

A live commerce platform for solo entrepreneurs in Africa. Sellers go live to present products, customers watch, chat, and buy — all in a single environment.

Built with **React / TypeScript / Supabase / Agora**.

---

## Table of Contents

- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [Database Schema & RLS](#database-schema--rls)
- [Security](#security)
- [Features](#features)
- [Error Handling](#error-handling)
- [Part C — Written Answers](#part-c--written-answers)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Vite + React + TS)                     │
│                                                                         │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────┐  ┌───────────┐  │
│  │   Auth    │  │  Products │  │   Live    │  │ Chat │  │   Cart    │  │
│  │  Pages    │  │   CRUD    │  │  Stream   │  │ Panel│  │  Context  │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──┬───┘  └───────────┘  │
│       │              │              │            │                       │
│  ┌────▼──────────────▼──────────────▼────────────▼─────────────────┐    │
│  │                    Supabase JS Client                           │    │
│  │         (Auth · DB queries · Storage · Realtime)                │    │
│  └────────────────────────┬───────────────────────────────────────-┘    │
│                           │                                             │
│  ┌────────────────────────▼────────────────────────────────────────┐    │
│  │                     Agora RTC SDK                               │    │
│  │    (Live mode · Host=Publisher · Audience=Subscriber)           │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │        SUPABASE CLOUD       │
              │                             │
              │  ┌───────────────────────┐  │
              │  │   Supabase Auth       │  │
              │  │   (email/password)    │  │
              │  └───────────────────────┘  │
              │                             │
              │  ┌───────────────────────┐  │
              │  │   PostgreSQL + RLS    │  │
              │  │  ┌─────────────────┐  │  │
              │  │  │ profiles        │  │  │
              │  │  │ products        │  │  │
              │  │  │ live_sessions   │  │  │
              │  │  │ chat_messages   │  │  │
              │  │  └─────────────────┘  │  │
              │  └───────────────────────┘  │
              │                             │
              │  ┌───────────────────────┐  │
              │  │   Supabase Storage   │  │
              │  │   (product-images)   │  │
              │  └───────────────────────┘  │
              │                             │
              │  ┌───────────────────────┐  │
              │  │   Supabase Realtime  │  │
              │  │   (postgres_changes  │  │
              │  │    on chat_messages)  │  │
              │  └───────────────────────┘  │
              │                             │
              │  ┌───────────────────────┐  │
              │  │   Edge Function      │  │
              │  │  generate-agora-token│  │
              │  └───────────────────────┘  │
              └─────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │        AGORA CLOUD          │
              │   (SD-RTN Media Servers)    │
              │                             │
              │  Live video/audio routing   │
              │  Host ──▶ Audience relay    │
              └─────────────────────────────┘
```

### Architecture Choices

| Decision | Rationale |
|----------|-----------|
| **Vite + React SPA** | Fast dev iteration, no SSR needed for a live commerce app. Hot module replacement speeds up development. |
| **Supabase Realtime (Postgres Changes)** for chat | Messages persist in the database. Late-joining customers get full chat history via a query, plus live updates via WebSocket subscription. More reliable than ephemeral Broadcast mode. |
| **Supabase Edge Function** for Agora tokens | No separate server to deploy or maintain. The Agora App Certificate stays in Supabase Secrets — never touches the client bundle. JWT-verified by default. |
| **Agora `live` mode** (not `rtc`) | Supports host/audience role separation at the SDK level. Audience members cannot publish streams. Scales to 1M+ viewers per channel. `rtc` mode treats all users as equal publishers — wrong model for live commerce. |
| **Client-side cart (React Context + localStorage)** | No database round-trips for every quantity change. Cart persists across page navigations within a session. For an MVP, server-side cart adds complexity without proportional value. |
| **Slide-over panel for "View Product"** | The customer can inspect product details without losing the live video. The stream keeps playing behind the overlay. No page navigation, no stream interruption. |

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Agora](https://console.agora.io) account with App Certificate enabled
- Supabase CLI (for Edge Function deployment)

### 1. Clone and install

```bash
git clone <repo-url>
cd reneo-live
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AGORA_APP_ID=your-agora-app-id
```

> **Note:** The Agora App ID is safe to include in the client bundle. It identifies your project but cannot generate tokens alone. The App Certificate (which can generate tokens) is stored only in Supabase Edge Function secrets.

### 3. Set up the database

Run the migration SQL in your Supabase Dashboard → SQL Editor:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, RLS policies, storage bucket, and realtime subscriptions.

### 4. Enable Realtime

In Supabase Dashboard → Database → Replication, ensure `chat_messages` and `live_sessions` tables are added to the `supabase_realtime` publication.

### 5. Deploy the Edge Function

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase login
supabase link --project-ref your-project-ref

# Set Agora secrets
supabase secrets set AGORA_APP_ID=your-agora-app-id
supabase secrets set AGORA_APP_CERTIFICATE=your-agora-app-certificate

# Deploy
supabase functions deploy generate-agora-token
```

### 6. Run locally

```bash
npm run dev
```

Open http://localhost:5173

---

## Database Schema & RLS

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile with name, avatar, role (seller/customer) |
| `products` | Product catalog: name, description, price, image, stock, status |
| `live_sessions` | Live stream sessions with host, product, status, channel |
| `chat_messages` | Real-time chat messages per session |

### Row Level Security Policies

All tables have RLS enabled. The complete SQL is in `supabase/migrations/001_initial_schema.sql`.

**profiles:**
- SELECT: Anyone can view (public profiles)
- INSERT: Only self (`auth.uid() = id`)
- UPDATE: Only self

**products:**
- SELECT: Active products visible to all; draft/archived visible only to owner
- INSERT: Only as self (`auth.uid() = seller_id`)
- UPDATE: Only owner
- DELETE: Only owner

**live_sessions:**
- SELECT: Anyone can view
- INSERT: Only as self (`auth.uid() = host_id`)
- UPDATE: Only owner

**chat_messages:**
- SELECT: Any authenticated user
- INSERT: Only as self (`auth.uid() = sender_id`)

---

## Security

### What stops a user from editing the ID in a request and deleting another seller's product?

Row Level Security. The delete policy on `products` is:

```sql
CREATE POLICY "Sellers can delete own products"
  ON products FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id);
```

`auth.uid()` is extracted **server-side** by Supabase from the JWT in the Authorization header — not from the request body or URL parameters. Even if a malicious user sends a DELETE request with another seller's product ID, PostgreSQL evaluates `auth.uid() = seller_id` and finds no match. Zero rows are deleted.

**A hidden button is not access control.** The frontend may hide the delete button from non-owners, but that's a UX convenience. The actual enforcement happens at the database level via RLS.

### Agora token security

- The **Agora App ID** is in the client `.env` (public, safe — like a project identifier)
- The **Agora App Certificate** is stored in Supabase Edge Function secrets — never in the client bundle, never in the repository
- Tokens are generated server-side by the Edge Function `generate-agora-token`
- The Edge Function verifies the user's JWT before generating a token
- Tokens expire after 1 hour
- The client handles `token-privilege-will-expire` events to refresh tokens

### No secrets in the repository

- `.env` is in `.gitignore`
- `.env.example` contains only empty placeholders
- Agora App Certificate is stored via `supabase secrets set` — never written to any file

---

## Features

### A1. Authentication and Roles
- Email/password sign-up and sign-in via Supabase Auth
- Two roles: Seller and Customer, selected at sign-up
- Role-based routing and UI

### A2. User Profile
- `profiles` table with id (FK to auth.users), name, avatar_url, role, created_at
- Created automatically on sign-up

### A3. Product Creation (Seller)
- Full CRUD: name, description, price, image, stock, status
- Image upload to Supabase Storage (`product-images` bucket)
- Sellers see only their own products

### A4. Live Session
- Seller picks a product and clicks "Go Live"
- Creates a session record with unique channel_name, status='live'
- Session record: id, host_id, product_id, status, channel_name, viewer_count, created_at

### A5. Agora Live Video
- Mode: `live` (not `rtc`)
- Seller joins as **host** (publisher) — camera + microphone
- Customer joins as **audience** (subscriber) — watch only, no local stream published
- Host controls: mute/unmute, camera on/off, fullscreen, end live
- End live persists status change to 'ended' in the database

### A6. Live Commerce View (Customer)
- Live indicator badge with pulsing dot
- Host video stream
- Seller's name and viewer count
- Product overlay: image, name, price, stock
- "View Product" opens a slide-over panel without leaving the stream
- "Add to Cart" button

**Why a slide-over panel?** The customer can inspect the full product details (description, larger image) while the live video continues playing behind the semi-transparent overlay. No page navigation occurs, so the Agora connection is never interrupted. On mobile, the panel covers the full screen but the audio keeps playing.

### A7. Real-time Chat
- Supabase Realtime via `postgres_changes` on the `chat_messages` table
- Messages are persisted to PostgreSQL — late joiners see chat history
- Each message: sender_name, message text, timestamp
- Auto-scrolls to latest message
- RLS ensures users can only post as themselves

### A8. Cart
- Add product, change quantity, remove item, see total
- Persisted to localStorage
- Accessible from the live session and the cart page
- No real payment required

### A9. Responsive Web and Mobile
- Mobile-first CSS with breakpoints at 768px and 480px
- Live session: video fills top half on mobile, chat/product tabs below
- Tab navigation on mobile: switch between Chat and Product panels
- All controls accessible via touch
- Product grid adapts from multi-column to single-column

### A10. Security
See [Security](#security) section above.

### A11. Error Handling
| Scenario | User-facing message |
|----------|-------------------|
| Camera permission denied | "Camera access denied. Please allow camera in your browser settings." |
| Microphone unavailable | "Microphone not found. Please connect a microphone and try again." |
| Agora connection failure | "Connection failed. Check your internet and try again." |
| Live already ended | "This live session has ended" with back button |
| Product not found | 404 with "Product not found" |
| Expired user session | Auto-redirect to sign-in page |
| Network interruption | Toast: "Connection lost. Attempting to reconnect..." |
| Agora token expired | Automatic token refresh via `token-privilege-will-expire` event |

### A12. Architecture Diagram
See [Architecture](#architecture) section above.

---

## Part C — Written Answers

### 1. Which part of this would break first if 500 customers joined the same live? What would you change?

**Chat would break first.** Each chat message is an INSERT into PostgreSQL, which triggers a Supabase Realtime broadcast to all 500 subscribers. At 500 concurrent viewers, even modest message rates (5 msg/sec) create:

- 2,500 WebSocket messages per second from Supabase
- Database write amplification from the WAL-based realtime system
- Potential Supabase Realtime connection limits (depending on plan)

**What I would change:**

1. **Move chat to Supabase Broadcast (ephemeral)** instead of Postgres Changes. Messages bypass the database entirely, reducing write load from O(N) to O(1) per message. Trade-off: no chat history for late joiners, which is acceptable for live commerce.

2. **Rate-limit chat messages** on the client (1 message per 2 seconds per user) and on the server via a database function or Edge Function middleware.

3. **Batch viewer count updates** instead of updating the `live_sessions.viewer_count` on every join/leave. Use Supabase Presence to track viewers in-memory and sync to the database every 30 seconds.

4. **The Agora video stream itself would handle 500 viewers fine** — Agora's `live` mode is designed for 1M+ audience members. The SD-RTN network handles audience-side CDN distribution.

5. At scale, I would consider **Redis or a dedicated message broker** (e.g., Ably, Pusher) for chat instead of Supabase Realtime, and use Supabase only for persistence.

### 2. What did you not have time to do, and what would you do next with two more days?

**Not implemented:**
- Live recording (Agora cloud recording API)
- Real-time viewer count via Supabase Presence
- Emoji reactions overlay
- Automatic reconnection with exponential backoff
- Unit/integration tests
- PWA support
- Multiple products per live session

**With two more days, I would:**

1. **Add Agora Cloud Recording** — Start recording when the seller goes live, save the recording to Supabase Storage. This enables replay and helps with dispute resolution.

2. **Implement real-time viewer count** — Use Supabase Realtime Presence to track who's in the channel. Update the viewer count badge live without polling.

3. **Write tests** — Unit tests for CartContext (add, remove, quantity logic), integration tests for the auth flow, and an E2E test for the "go live → join → chat → add to cart" flow using Playwright.

4. **Add automatic reconnection** — Handle `connection-state-change` events from Agora with exponential backoff. Show a reconnecting overlay instead of dropping the user.

5. **Multiple products per live session** — Allow the seller to switch the featured product mid-stream without creating a new session. Add a `featured_product_id` field and a product queue.

6. **PWA support** — Add a service worker and manifest for installability on mobile. Offline support for the cart page.

### 3. Where did you use a library or an AI assistant to do something you would not have been able to write yourself, and what did you learn about it afterwards?

**Agora RTC SDK integration.** I used the Agora documentation and an AI assistant to understand the distinction between `live` and `rtc` client modes, and the correct way to configure host vs. audience roles. Before this project, I had not worked with WebRTC live streaming at scale.

**What I learned:**
- The `live` mode uses Agora's SD-RTN (Software Defined Real-Time Network) which is fundamentally different from peer-to-peer WebRTC. Audience members connect to edge servers, not directly to the host.
- `setClientRole('audience')` is not just a permission flag — it changes the underlying transport protocol. Audience members use a lower-latency receive-only path.
- Token generation with `RtcTokenBuilder.buildTokenWithUid()` requires careful attention to role-based privileges. A SUBSCRIBER token cannot be used to publish, which is the correct security model for live commerce.

**Supabase Edge Functions.** I used AI assistance to understand the Deno runtime specifics (npm: specifiers, `Deno.serve`, `Deno.env`) and the correct CORS header setup for Edge Functions. The key learning was that Edge Functions in Supabase automatically receive the user's JWT via the Authorization header from the Supabase client, making auth verification straightforward.

**Supabase Realtime architecture.** I researched the trade-offs between `postgres_changes` and `broadcast` channels with AI assistance. The critical insight: `postgres_changes` reads from PostgreSQL's Write-Ahead Log (WAL), which means every subscriber receives the same event regardless of RLS — but the Supabase client filters server-side before delivery. This is important for chat security.

---

## Project Structure

```
reneo-live/
├── public/
├── src/
│   ├── components/
│   │   ├── ErrorBoundary.tsx
│   │   ├── Header.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── live/
│   │       ├── ChatPanel.tsx
│   │       ├── ProductDetailPanel.tsx
│   │       └── StreamEnded.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── CartContext.tsx
│   ├── hooks/
│   │   ├── useAgoraToken.ts
│   │   └── useMediaPermissions.ts
│   ├── lib/
│   │   └── supabase.ts
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── CartPage.tsx
│   │   ├── CreateProductPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── LiveSessionPage.tsx
│   │   └── ProductsPage.tsx
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── supabase/
│   ├── functions/
│   │   └── generate-agora-token/
│   │       └── index.ts
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── README.md
├── tsconfig.json
└── vite.config.ts
```

---

## License

This project was built as a technical assessment for Reneo.
