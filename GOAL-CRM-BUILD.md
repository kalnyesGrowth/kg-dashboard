# MASTER PROMPT: KalnyesGrowth Client CRM WebApp

## PURPOSE
Build a complete CRM webapp for KalnyesGrowth web design agency clients. This app justifies the $500/mo retainer by giving local business owners real tools to manage leads, communicate with customers, and see ROI from their website. The app must be 100% free to run and host.

---

## CURRENT STATE

**Live URL:** https://project-kday6.vercel.app
**Source:** ~/agency-dashboard/
**Stack:** Vanilla JS SPA, Supabase (auth + postgres + edge functions), Chart.js, Vercel, Resend API
**GitHub:** Auto-deploys from main branch to Vercel

### What Already Exists (DO NOT rebuild, extend these)
- Agency + client login with role-based views (agency sees all, client sees their own)
- Metrics dashboard (revenue, sessions, leads, emails, orders) with Chart.js
- Subscriber list with live search
- Email broadcast modal via Resend
- Live event feed from tracker snippet on client sites
- PWA with service worker + manifest
- pg_cron daily rollup edge function
- 5 real clients seeded in Supabase
- Skeleton loaders, dark theme, mobile-responsive

### Key Files (read these first to understand patterns)
- `app.js` - SPA router
- `views.js` - all UI views
- `supabase/db.js` - all database queries
- `supabase/client.js` - Supabase credentials
- `utils.js` - auth helpers
- `data.js` - mock data fallback
- `tracker/tracker.js` - client site tracking snippet

---

## WHAT TO BUILD (in priority order)

### TIER 1: Core CRM (Build First, These Are Deal-Breakers)

#### 1. Lead Inbox
The tracker already captures form submission events but they show as a count. Build a dedicated lead inbox view.
- Show every form submission as a card: name, email, phone, message, timestamp, source page
- Mark leads as: New, Contacted, Quoted, Won, Lost (pipeline stages)
- Click a lead to see full details + add notes
- Filter by stage, date range, source
- Badge count on nav showing unread/new leads
- **DB:** Create `leads` table with: id, client_id, name, email, phone, message, source_url, stage (enum), notes (jsonb array), created_at, updated_at
- **Tracker update:** Modify tracker.js to capture form field data (name, email, phone, message) on submit events, not just "form_submit" event type. POST to a new edge function `capture-lead` that inserts into leads table
- **RLS:** Clients see only their own leads. Agency sees all.

#### 2. Contact Management
Upgrade the flat subscriber list into a real contact manager.
- Contacts table: id, client_id, name, email, phone, source (manual, form, import), tags (text array), notes, lead_stage, created_at
- Merge existing subscribers into contacts
- Add contact manually (form with name, email, phone, tags)
- CSV import (parse client-side, bulk insert via edge function)
- Tag system: add/remove tags like "VIP", "Wedding", "Wholesale", "Repeat Customer"
- Search across name, email, phone, tags
- Click contact to see: all interactions (emails sent, form submissions, notes timeline)
- **Migration:** Write SQL migration to create contacts table and migrate existing subscriber data

#### 3. Notifications & Alerts
Zero notifications exist. Local business owners miss leads because they only see them when they log in.
- **Email notifications** via Resend (free tier: 100/day):
  - New lead alert: instant email to client with lead details + link to dashboard
  - Daily summary: "You got 3 new leads today" (skip if zero)
  - Weekly report digest: key metrics email every Monday
- **In-app notifications:**
  - Bell icon in nav with unread count
  - Notifications dropdown: "New lead from John Smith", "Email campaign sent", "Monthly report ready"
  - notifications table: id, client_id, type, title, body, read (bool), link, created_at
- **Edge function:** `notify-new-lead` triggered after lead capture. Sends email + creates in-app notification
- **Edge function:** `daily-digest` via pg_cron at 8am ET. Sends summary email if there were new leads/events

#### 4. Automated Email Sequences
Only broadcast exists. Build drip/automation sequences.
- **Sequences table:** id, client_id, name, trigger_type (new_subscriber, new_lead, manual), steps (jsonb array of {delay_hours, subject, body_template})
- **Pre-built templates** (agency creates, clients can customize):
  - Welcome sequence: "Thanks for subscribing" (immediate) -> "Here's what we offer" (day 3) -> "Special offer for new subscribers" (day 7)
  - Lead follow-up: "Thanks for your inquiry" (immediate) -> "Just checking in" (day 2) -> "Still interested?" (day 5)
  - Review request: "Thanks for visiting" (day 1) -> "Would you leave us a review?" (day 3)
- **Sequence runner edge function:** `run-sequences` via pg_cron every hour. Checks pending sequence steps, sends due emails, marks as sent
- **sequence_enrollments table:** id, contact_id, sequence_id, current_step, status (active, completed, cancelled), next_send_at
- UI: sequence builder (simple step editor), enrollment list, pause/cancel individual enrollments
- **Personalization:** {{first_name}}, {{business_name}}, {{last_visit}} merge tags in email templates

---

### TIER 2: High-Value Differentiators (Build Second)

#### 5. Review Management
Local businesses live and die by Google reviews.
- Show current Google rating + review count (scrape via edge function, cache in DB, update daily)
- Display recent Google reviews in dashboard
- "Send Review Request" button: select contacts -> sends templated email/SMS with direct Google review link
- Review request tracking: sent, opened, completed
- **Edge function:** `fetch-google-reviews` runs daily via pg_cron, stores in reviews table
- **reviews table:** id, client_id, platform, author, rating, text, date, fetched_at
- Generate the client's Google review URL from their Place ID (store in clients table)

#### 6. Website Change Requests
Clients currently email/text to request changes. Build a ticket system.
- "Request a Change" button prominently in client dashboard
- Simple form: category (Hours, Menu/Services, Photos, Content, Bug, Other), description, optional image upload (Supabase Storage, free 1GB)
- Tickets table: id, client_id, category, description, image_url, status (new, in_progress, done), agency_notes, created_at, completed_at
- Client sees their ticket history + status
- Agency sees all tickets across clients, can update status + add notes
- Email notification to agency when new ticket created
- Email notification to client when ticket status changes to "done"

#### 7. Monthly Report PDF
Reports view exists but no export.
- Generate branded PDF client-side using jsPDF (zero cost)
- Include: KalnyesGrowth logo, client business name, month/year
- Sections: website visits, unique visitors, top pages, leads generated, emails sent, subscriber growth, Google rating
- Charts rendered as images (canvas.toDataURL from existing Chart.js)
- Auto-email on 1st of each month via edge function `monthly-report`
- Client can also click "Download Report" anytime from reports view

#### 8. Appointment Booking (Simple)
Don't build a full Calendly clone. Build a basic booking widget.
- Availability settings: client sets which days/hours they accept appointments (store in clients table jsonb)
- Booking page: public URL like /book/[client-slug] with date picker + time slots + name/email/phone form
- Bookings table: id, client_id, contact_id, date, time, name, email, phone, status (pending, confirmed, cancelled), created_at
- Email notification to client when new booking
- Email confirmation to customer with business details
- Dashboard view: upcoming appointments calendar (simple list, not full calendar UI)
- Can embed as widget on client's website via iframe or script tag

---

### TIER 3: Premium Features (Build Last)

#### 9. Two-Way SMS (Twilio Free Trial or Alternatives)
- Twilio free trial gives $15 credit (~1,500 SMS)
- After trial: look into free alternatives (Vonage free tier, or skip SMS and use email-only)
- Send SMS to leads directly from dashboard
- Receive SMS replies (Twilio webhook -> edge function -> store in messages table)
- Conversation thread view per contact

#### 10. Website Uptime Monitor
- Edge function `check-uptime` via pg_cron every 15 min
- Simple HTTP HEAD request to client's site URL
- uptime_checks table: id, client_id, status_code, response_time_ms, checked_at
- Dashboard badge: "99.9% uptime this month"
- Alert notification if site goes down (status != 200 for 2+ consecutive checks)

#### 11. SEO Dashboard (Basic)
- Google Search Console API integration (free, requires client to grant access)
- Show: total clicks, impressions, avg position, top queries, top pages
- Store weekly snapshots for trend charts
- Local map pack rank tracking (manual entry or scrape)

#### 12. White-Label Branding
- clients table gets: custom_logo_url, primary_color, secondary_color, app_name
- Dashboard applies client's branding when they log in
- Report PDFs use client's logo
- Login page shows client's business name if accessed via custom subdomain

---

## TECHNICAL RULES (MANDATORY)

### Free-Only Stack
- **Hosting:** Vercel free tier (100GB bandwidth, 100 deployments/day). NEVER pay for hosting.
- **Database:** Supabase free tier (500MB DB, 1GB storage, 50K MAU, 500K edge function invocations). If approaching limits, optimize queries and reduce edge function calls before considering paid.
- **Email:** Resend free tier (100 emails/day, 3,000/month). Batch wisely. If over limit, queue emails and send next day. NEVER pay for email unless client count exceeds 20+.
- **PDF:** jsPDF (client-side, free forever). NEVER use paid PDF APIs.
- **SMS:** Twilio free trial first. When credits run out, evaluate if revenue justifies cost. Otherwise skip SMS.
- **Image storage:** Supabase Storage (1GB free). Compress images client-side before upload.
- **Cron jobs:** pg_cron via Supabase (free). NEVER use external cron services.
- **Analytics/tracking:** Custom tracker.js (already built, free). NEVER add Google Analytics or paid analytics.
- **Search:** Client-side filtering with JS. NEVER use Algolia or paid search.
- If a feature requires a paid service with no free alternative, SKIP IT or find a workaround. Build it yourself before paying anyone.

### Code Architecture
- **Keep Vanilla JS.** Do not migrate to React, Vue, or any framework. The current SPA pattern works. Adding a framework adds build complexity for zero benefit at this scale.
- **One file per concern.** Current pattern: views.js has all views, db.js has all queries. As features grow, split into: `views/leads.js`, `views/contacts.js`, `views/sequences.js`, etc. Import via ES modules.
- **Supabase edge functions** for all server-side logic (email sending, webhook handling, cron jobs, external API calls). Write in TypeScript/Deno.
- **RLS on every table.** Clients must ONLY see their own data. Agency role sees all. Test RLS policies before deploying. A client seeing another client's leads is a fatal bug.
- **Mobile-first.** Every view must work on a phone. Local business owners check their dashboard from their phone at the register, not from a desktop.
- **Dark theme maintained.** Current dark theme is the brand. All new views match existing color scheme and component patterns.
- **No external CDN dependencies** beyond what already exists (Chart.js, Supabase JS). Every new feature uses vanilla JS or the existing stack.

### Database Rules
- Write SQL migrations as files in `supabase/migrations/` with timestamps: `20260617_create_leads.sql`
- Every table needs: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `client_id uuid references clients(id)`
- Enable RLS on every table immediately after creation
- Create indexes on: client_id (every table), created_at (for sorting), email (contacts), stage (leads)
- Use jsonb for flexible fields (notes, sequence steps, availability) but never for fields you need to query/filter on
- Foreign keys with ON DELETE CASCADE for client-dependent tables

### Edge Function Rules
- Keep functions small and focused. One function per job.
- Always return proper HTTP status codes and JSON responses
- Rate limit external API calls (Google reviews scraping: max 1x/day per client)
- Log errors to a `function_logs` table for debugging
- Set CORS headers for functions called from the frontend
- Use environment variables for all API keys (Resend, Twilio, etc.)

### Security Rules
- NEVER store API keys in frontend code (they're in Supabase edge function env vars)
- NEVER trust client-side data. Validate everything in edge functions
- Sanitize all user input before storing (prevent XSS in notes, messages, etc.)
- Rate limit the lead capture endpoint (prevent spam: max 10 submissions per IP per hour)
- The tracker.js must not expose the Supabase anon key. Lead capture goes through an edge function endpoint
- Email templates must escape user-provided content (prevent email injection)

### Deployment Rules
- Test locally before pushing. Use Supabase local dev if possible.
- Database migrations go through Supabase dashboard SQL editor (we don't have CLI linked)
- Edge functions deploy via: `supabase functions deploy function-name`
- Frontend auto-deploys to Vercel on git push to main
- NEVER push breaking changes to main without testing. Use a feature branch if unsure.

---

## BUILD ORDER

Follow this exact sequence. Complete each phase before starting the next. Test everything before moving on.

### Phase 1: Database Foundation
1. Create all Tier 1 tables (leads, contacts, notifications, sequences, sequence_enrollments)
2. Write and apply RLS policies for each
3. Create indexes
4. Migrate existing subscribers to contacts table

### Phase 2: Lead Inbox
1. Update tracker.js to capture form field data
2. Create `capture-lead` edge function
3. Build lead inbox view in frontend
4. Build lead detail view with notes
5. Add pipeline stage management
6. Add unread badge to nav

### Phase 3: Contact Management
1. Build contacts view (list with search, filters, tags)
2. Build contact detail view (timeline of interactions)
3. Add manual contact creation form
4. Add CSV import
5. Add tag management

### Phase 4: Notifications
1. Create notifications table
2. Build `notify-new-lead` edge function
3. Build notification bell UI component
4. Create `daily-digest` edge function with pg_cron
5. Wire up email notifications for key events

### Phase 5: Automated Sequences
1. Build sequence builder UI
2. Create `run-sequences` edge function
3. Set up pg_cron hourly trigger
4. Create 3 pre-built sequence templates
5. Build enrollment management view

### Phase 6: Tier 2 Features
6. Review management (Google review fetching + review request sending)
7. Change request tickets
8. Monthly report PDF generation
9. Basic appointment booking

### Phase 7: Tier 3 Features (Only After Tier 1+2 Are Solid)
10. SMS integration
11. Uptime monitoring
12. SEO dashboard
13. White-label branding

---

## SUCCESS METRICS

The app is done when a local business owner can:
1. Log in on their phone and see "You got 2 new leads today"
2. Read the lead's name, message, and phone number
3. Mark it as "Contacted" after calling them
4. See their subscriber list with tags
5. Set up an automated welcome email for new subscribers
6. Get an email alert at 3am when someone submits a quote request
7. Send a review request to 10 recent customers with one click
8. Submit a "change my hours" request from the dashboard
9. Download a branded PDF report to show their business partner
10. Book appointments through their website

And KalnyesGrowth (agency side) can:
1. See all clients' leads, contacts, and metrics in one view
2. Manage change request tickets across all clients
3. Monitor which sequences are running and performing
4. Generate reports for any client
5. Add new clients and issue their login credentials

---

## WHAT THIS IS NOT

- This is NOT a website builder. Client websites are separate HTML files deployed to GitHub Pages.
- This is NOT a social media manager. No posting, scheduling, or social content.
- This is NOT an invoicing tool (Phase 1). Payment tracking comes in Tier 3 if ever.
- This is NOT a replacement for GHL/GoHighLevel. It's a lightweight, free, agency-owned CRM that does 80% of what GHL does at 0% of the cost.
