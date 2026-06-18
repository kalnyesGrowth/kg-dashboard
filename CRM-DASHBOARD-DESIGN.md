# KalnyesGrowth CRM Dashboard: Master UI/UX Design Specification

## PURPOSE

This document defines every screen, component, interaction, and layout for the KalnyesGrowth CRM webapp. It covers two complete experiences:

1. **Client Dashboard** - What local business owners see when they log in (their own data only)
2. **Agency Dashboard** - What JJ (agency owner) sees when he logs in (all clients, all data, management tools)

Use this alongside GOAL-CRM-BUILD.md (technical build spec) when building with /goal.

---

## DESIGN SYSTEM

### Current Stack (DO NOT change)
- Dark sidebar (#1A1A1A), light content area (#F1F4F7)
- Inter font family, 14px base
- Blue accent (#0064E0), green for positive (#007D1E), red for negative (#C80A28), amber for warnings (#B98900)
- Cards with #FFFFFF background, 12px radius, subtle shadow
- Sidebar on desktop (220px fixed left), hamburger drawer on mobile
- Chart.js for all data visualization

### Brand Accent for CRM Features
- Keep existing blue (#0064E0) as primary action color
- Gold accent (#C8A96E) reserved for KalnyesGrowth branding elements only (logo mark, premium badges)
- All new features must match existing card/surface/shadow patterns

### Typography Scale
- Page titles: 1.2rem, weight 800, --text-primary
- Section headers: 0.95rem, weight 700, --text-primary
- Card titles: 0.85rem, weight 700
- Body text: 0.82rem, weight 400, --text-primary
- Secondary text: 0.75rem, weight 400, --text-secondary
- Badges/chips: 0.68rem, weight 600, uppercase, letter-spacing 0.04em

### Spacing System
- Section gap: 20px
- Card padding: 20px (16px on mobile)
- Element gap inside cards: 12px
- Tight gap (list items): 8px

### Mobile Breakpoints
- Desktop: > 768px (sidebar visible, multi-column layouts)
- Mobile: <= 768px (hamburger drawer, single column, bottom tab bar for client view)

---

## NAVIGATION STRUCTURE

### Agency Sidebar (Desktop)
```
[KG Logo Mark]  Kalnyesgrowth
-----------------------------
MAIN
  Dashboard          (home icon)
  Clients            (people icon)
  Leads              (inbox icon) [badge: unread count]
  Contacts           (book icon)

TOOLS
  Sequences          (mail-flow icon)
  Tickets            (clipboard icon) [badge: open count]
  Reports            (chart icon)
  Reviews            (star icon)

ACCOUNT
  Settings           (gear icon)
-----------------------------
[Avatar] Kalnyesgrowth
Sign out
```

### Agency Mobile Header
- Hamburger (opens sidebar drawer)
- Page title (center)
- Notification bell (right) with unread badge

### Client Bottom Tab Bar (Mobile)
```
[ Home ]  [ Leads ]  [ Contacts ]  [ More ]
```
- 4 tabs max, "More" opens a sheet with: Email, Reviews, Bookings, Reports, Website, Settings
- Active tab: blue icon + label. Inactive: gray icon, no label
- 56px height, fixed bottom, white background, top border

### Client Sidebar (Desktop)
```
[Business Logo/Initials]  Business Name
-----------------------------------------
  Home                   (home icon)
  Leads                  (inbox icon) [badge]
  Contacts               (people icon)
  Email Marketing        (mail icon)
  Reviews                (star icon)
  Appointments           (calendar icon)
  Website                (globe icon)
  Reports                (chart icon)
  Settings               (gear icon)
-----------------------------------------
  Need help? Contact us
  Sign out
```

---

## CLIENT DASHBOARD SCREENS

### C1: Client Home / Overview

**Purpose:** First thing the business owner sees. Answer: "How's my business doing today?"

**Layout:**
```
+--------------------------------------------------+
|  Good morning, [First Name]                       |
|  [Business Name] - [Today's date]                 |
+--------------------------------------------------+
|                                                    |
|  +----------+  +----------+  +----------+         |
|  | NEW LEADS |  | CONTACTS |  | EMAILS   |        |
|  |    7      |  |   142    |  |   23     |        |
|  | this week |  |  total   |  | sent/mo  |        |
|  +----------+  +----------+  +----------+         |
|                                                    |
|  RECENT LEADS                     [View All ->]   |
|  +--------------------------------------------+   |
|  | John Smith        NEW    2h ago            |   |
|  | "Looking for wedding cake pricing"         |   |
|  +--------------------------------------------+   |
|  | Maria Lopez       NEW    5h ago            |   |
|  | "Do you cater corporate events?"           |   |
|  +--------------------------------------------+   |
|  | David Chen     CONTACTED  1d ago           |   |
|  | "Need a quote for 200 cupcakes"            |   |
|  +--------------------------------------------+   |
|                                                    |
|  WEBSITE PERFORMANCE              [Full Report]   |
|  +--------------------------------------------+   |
|  | [====== Line Chart: 30-day visits ======]  |   |
|  | 1,247 visits this month  (+12%)            |   |
|  +--------------------------------------------+   |
|                                                    |
|  GOOGLE REVIEWS                                   |
|  +--------------------------------------------+   |
|  | 4.8 stars (127 reviews)  [Send Request]    |   |
|  | "Amazing cakes! Best in..."  - Sarah T.    |   |
|  +--------------------------------------------+   |
|                                                    |
|  UPCOMING APPOINTMENTS                            |
|  +--------------------------------------------+   |
|  | Tomorrow 2:00 PM - Jane Doe (Consultation) |   |
|  | Thu 10:00 AM - Mike R. (Tasting)           |   |
|  +--------------------------------------------+   |
|                                                    |
|  +--------------------------------------------+   |
|  | [Request a Website Change]  ghost button   |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Metric Cards:**
- 3 cards on desktop (equal width, flex row), stack to 3-column on mobile (compact)
- Each card: white background, 12px radius, number in 1.5rem bold, label in 0.72rem secondary text
- Number color: blue for neutral, green if trending up, red if trending down
- Subtle trend arrow next to number if data available

**Recent Leads Section:**
- Show last 3-5 leads as cards
- Each card: name (bold), stage badge (colored pill), time ago (right-aligned secondary)
- Below name: first 60 chars of their message in secondary text
- Stage badges: NEW (blue), CONTACTED (amber), QUOTED (purple), WON (green), LOST (red/muted)
- Tap/click a lead card -> navigates to Lead Detail (C2)
- "View All" link -> navigates to Lead Inbox (C2)

**Website Performance:**
- Line chart (Chart.js, existing pattern) showing 30-day visitor trend
- Single stat below: "X visits this month" with trend percentage badge
- "Full Report" link -> Reports screen

**Google Reviews:**
- Star rating display (gold stars), review count
- Latest review snippet (1 line, truncated)
- "Send Request" button (blue outline) -> opens review request flow

**Upcoming Appointments:**
- Next 2-3 appointments, simple list
- Date/time, customer name, appointment type
- Empty state: "No upcoming appointments" with "Set up booking" link

**Website Change Request:**
- Single ghost button at the bottom
- "Request a Website Change" -> opens change request form (C7)

**Mobile Layout:**
- Metric cards: 3 in a row (compact, smaller numbers)
- All sections stack vertically
- Bottom tab bar visible

---

### C2: Lead Inbox

**Purpose:** See every person who contacted the business through their website. Act on leads fast.

**Layout:**
```
+--------------------------------------------------+
|  Leads                           [Filter] [Sort]  |
+--------------------------------------------------+
|                                                    |
|  PIPELINE SUMMARY                                 |
|  [New: 4] [Contacted: 2] [Quoted: 1] [Won: 8]   |
|                                                    |
|  +--------------------------------------------+   |
|  | [Search leads by name, email, phone...]    |   |
|  +--------------------------------------------+   |
|                                                    |
|  FILTER: [All] [New] [Contacted] [Quoted]         |
|                                                    |
|  +--------------------------------------------+   |
|  | ** John Smith                    NEW        |   |
|  | john@email.com  |  (540) 555-0123          |   |
|  | "Looking for wedding cake pricing for       |   |
|  |  our June 2027 wedding, about 150 guests"  |   |
|  | From: /contact  |  2 hours ago              |   |
|  +--------------------------------------------+   |
|  | ** Maria Lopez                   NEW        |   |
|  | maria@corp.com  |  (571) 555-0456          |   |
|  | "Do you cater corporate events? Need for    |   |
|  |  company holiday party, 80 people"          |   |
|  | From: /catering  |  5 hours ago             |   |
|  +--------------------------------------------+   |
|  | David Chen                    CONTACTED     |   |
|  | david@email.com                             |   |
|  | "Need a quote for 200 cupcakes for..."      |   |
|  | From: /order  |  1 day ago                  |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Pipeline Summary Bar:**
- Horizontal row of stage counts as colored pills
- Each pill shows count. Tap to filter by that stage
- Active filter gets solid background, others get outline

**Search:**
- Full-width search input at top
- Searches across name, email, phone, message text
- Debounced, 300ms delay, client-side filtering

**Lead Cards:**
- Unread leads: bold name, blue left border (3px)
- Read leads: normal weight, no border
- Show: name, email, phone (if available), first 2 lines of message, source page, time ago
- Stage badge: right-aligned colored pill
- Tap card -> Lead Detail view

**Empty State:**
- Illustration placeholder (simple SVG inbox icon)
- "No leads yet"
- "Leads will appear here when someone fills out a form on your website"

**Filter/Sort:**
- Filter button opens dropdown: All, New, Contacted, Quoted, Won, Lost, Date range
- Sort: Newest first (default), Oldest first, By stage

---

### C3: Lead Detail

**Purpose:** See everything about one lead. Take action: call them, email them, add notes, change stage.

**Layout:**
```
+--------------------------------------------------+
|  [< Back to Leads]                                |
+--------------------------------------------------+
|                                                    |
|  John Smith                                       |
|  +--------------------------------------------+   |
|  | Email: john@email.com        [Copy]        |   |
|  | Phone: (540) 555-0123        [Call] [Copy]  |   |
|  | Source: kalnyesgrowth.github.io/contact     |   |
|  | Submitted: June 15, 2026 at 2:34 PM        |   |
|  +--------------------------------------------+   |
|                                                    |
|  STAGE                                            |
|  [New] [Contacted] [Quoted] [Won] [Lost]          |
|                                                    |
|  MESSAGE                                          |
|  +--------------------------------------------+   |
|  | "Looking for wedding cake pricing for our   |   |
|  |  June 2027 wedding, about 150 guests.       |   |
|  |  We'd love a tasting appointment if you     |   |
|  |  have availability this month."             |   |
|  +--------------------------------------------+   |
|                                                    |
|  NOTES                          [+ Add Note]      |
|  +--------------------------------------------+   |
|  | Jun 15, 3:10 PM                             |   |
|  | Called back, scheduled tasting for June 20  |   |
|  +--------------------------------------------+   |
|  | Jun 15, 2:45 PM                             |   |
|  | Left voicemail                              |   |
|  +--------------------------------------------+   |
|                                                    |
|  ACTIONS                                          |
|  +--------------------------------------------+   |
|  | [Send Email]  [Add to Contacts]  [Delete]  |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Contact Info Card:**
- White card with contact details
- Copy buttons for email and phone (copies to clipboard, shows toast)
- Call button (tel: link, opens phone dialer on mobile)
- Source URL shown as a link

**Stage Selector:**
- Horizontal row of 5 stage buttons
- Active stage: solid colored background
- Tap to change stage. Instant save to Supabase. Show toast "Stage updated"
- Stage changes are logged in the notes timeline automatically: "Stage changed from New to Contacted"

**Message:**
- Full message text in a card with slight left border (blue)
- No truncation

**Notes Timeline:**
- Reverse chronological (newest first)
- Each note: timestamp (secondary text) + note text
- "Add Note" button opens inline textarea at top of timeline
- Submit saves to Supabase, refreshes list
- Auto-generated system notes (stage changes) shown in italic with gray text

**Actions:**
- "Send Email" -> opens compose modal pre-filled with lead's email
- "Add to Contacts" -> creates a contact record from this lead's info
- "Delete" -> confirmation dialog, then soft-delete

---

### C4: Contacts

**Purpose:** The business's full customer database. Everyone who's ever interacted with the business.

**Layout:**
```
+--------------------------------------------------+
|  Contacts (142)           [+ Add] [Import CSV]    |
+--------------------------------------------------+
|                                                    |
|  +--------------------------------------------+   |
|  | [Search by name, email, phone, tag...]     |   |
|  +--------------------------------------------+   |
|                                                    |
|  TAGS: [All] [VIP] [Wedding] [Corporate]          |
|         [Wholesale] [Repeat]                      |
|                                                    |
|  +--------------------------------------------+   |
|  | JD  Jane Doe                               |   |
|  |     jane@email.com | (540) 555-7890        |   |
|  |     [VIP] [Wedding]           Jun 12, 2026 |   |
|  +--------------------------------------------+   |
|  | MR  Mike Rodriguez                         |   |
|  |     mike@biz.com                           |   |
|  |     [Corporate]               Jun 10, 2026 |   |
|  +--------------------------------------------+   |
|  | SK  Sarah Kim                              |   |
|  |     sarah.k@gmail.com | (571) 555-1234    |   |
|  |     [Repeat]                  Jun 8, 2026  |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Contact List:**
- Each row: initials circle (colored, like existing client cards), name, email, phone, tags, date added
- Tags: small colored pills (each tag gets a consistent color from preset palette)
- Tap row -> Contact Detail
- Desktop: can show as a wider card with more inline info
- Mobile: stacked layout, name + tags on one line, email below

**Add Contact Modal:**
- Fields: First Name, Last Name, Email, Phone, Tags (multi-select chips)
- All fields optional except email OR phone (need at least one)
- Save -> inserts to contacts table, shows toast

**CSV Import:**
- "Import CSV" button opens file picker
- Parse client-side (Papa Parse or manual CSV parser)
- Preview first 5 rows in a table
- Map columns: "Which column is Email?", "Which column is Name?", etc.
- Show count: "Ready to import 47 contacts"
- Import button -> bulk insert via edge function
- Progress bar during import
- Result: "Imported 47 contacts, 3 duplicates skipped"

**Tag Filters:**
- Horizontal scrollable row of tag pills
- "All" selected by default
- Tap tag to filter. Multiple tags = AND filter
- Active tag: solid background. Inactive: outline

---

### C5: Contact Detail

**Purpose:** Full history of one customer. Every interaction in one place.

**Layout:**
```
+--------------------------------------------------+
|  [< Back to Contacts]                             |
+--------------------------------------------------+
|                                                    |
|  +--------------------------------------------+   |
|  | [JD]  Jane Doe                    [Edit]   |   |
|  |       jane@email.com  |  (540) 555-7890   |   |
|  |       Tags: [VIP] [Wedding] [+ Add Tag]   |   |
|  |       Added: June 12, 2026 via Form        |   |
|  +--------------------------------------------+   |
|                                                    |
|  TIMELINE                                         |
|  +--------------------------------------------+   |
|  | Jun 15  Email sent: "Your order is ready"  |   |
|  | Jun 14  Note: "Confirmed 3-tier cake"      |   |
|  | Jun 12  Form submission (became a lead)     |   |
|  | Jun 12  Subscribed to email list            |   |
|  +--------------------------------------------+   |
|                                                    |
|  EMAILS SENT (3)                                  |
|  +--------------------------------------------+   |
|  | "Welcome to The Icing Baking Co."  Jun 12  |   |
|  | "Your Consultation Confirmation"   Jun 13  |   |
|  | "Your Order is Ready"             Jun 15  |   |
|  +--------------------------------------------+   |
|                                                    |
|  ACTIONS                                          |
|  +--------------------------------------------+   |
|  | [Send Email]  [Send Review Request]        |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Timeline:**
- Unified chronological timeline of ALL interactions
- Types: form submissions, emails sent, emails opened, notes added, stage changes, review requests sent
- Each entry: date, icon, description
- Most recent at top

**Edit Contact:**
- Inline edit mode: name, email, phone become editable
- Tag management: add/remove tags with chip input
- Save/Cancel buttons appear

---

### C6: Email Marketing

**Purpose:** Send broadcasts and manage automated sequences. Simple, not Mailchimp.

**Layout:**
```
+--------------------------------------------------+
|  Email Marketing                                   |
+--------------------------------------------------+
|                                                    |
|  OVERVIEW                                         |
|  +----------+  +----------+  +----------+         |
|  | CONTACTS |  | SENT/MO  |  | OPEN RATE|        |
|  |   142    |  |    23    |  |   34%    |        |
|  +----------+  +----------+  +----------+         |
|                                                    |
|  BROADCASTS                       [+ New Email]   |
|  +--------------------------------------------+   |
|  | "Summer Special: 20% Off Wedding..."       |   |
|  | Sent Jun 10  |  142 recipients  |  38% open|   |
|  +--------------------------------------------+   |
|  | "New: Cookie Decorating Classes!"          |   |
|  | Sent May 28  |  135 recipients  |  29% open|   |
|  +--------------------------------------------+   |
|                                                    |
|  ACTIVE SEQUENCES                 [+ New Seq.]    |
|  +--------------------------------------------+   |
|  | Welcome Sequence          ACTIVE           |   |
|  | 3 steps  |  12 enrolled  |  8 completed    |   |
|  +--------------------------------------------+   |
|  | Lead Follow-Up            ACTIVE           |   |
|  | 3 steps  |  4 enrolled  |  2 completed     |   |
|  +--------------------------------------------+   |
|  | Review Request            PAUSED           |   |
|  | 2 steps  |  0 enrolled                     |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Compose Email Modal (existing, enhance):**
- Subject line input
- Rich text body (keep simple: bold, italic, link, line break)
- Merge tags dropdown: {{first_name}}, {{business_name}}
- Recipient selection: All contacts, specific tags, manual selection
- Preview button: shows rendered email
- Send button: confirms count ("Send to 142 contacts?"), then sends via Resend edge function
- Sends in batches of 50 (existing pattern), shows progress

**Sequence Builder:**
- "New Sequence" opens full-screen builder
- Name input at top
- Trigger selector: "When someone subscribes", "When a new lead comes in", "Manual enrollment"
- Steps list (vertical timeline):
  - Step 1: Send email [Subject] [Body] - Immediately
  - Step 2: Wait [3] days, then send [Subject] [Body]
  - Step 3: Wait [4] days, then send [Subject] [Body]
  - [+ Add Step]
- Each step: delay selector (hours/days dropdown + number), subject, body
- Save as Draft / Activate buttons
- Pre-built templates: "Welcome Series", "Lead Follow-Up", "Review Request" (one-click to load)

**Sequence Detail:**
- Shows all enrolled contacts with their current step and status
- Can pause/cancel individual enrollments
- Stats: completion rate, average time to complete

---

### C7: Website Change Request

**Purpose:** Business owner needs their hours updated, a photo changed, or something fixed on their site.

**Layout:**
```
+--------------------------------------------------+
|  Website Changes                                   |
+--------------------------------------------------+
|                                                    |
|  [+ Request a Change]                             |
|                                                    |
|  YOUR REQUESTS                                    |
|  +--------------------------------------------+   |
|  | Update business hours         COMPLETED    |   |
|  | Submitted Jun 14  |  Done Jun 14           |   |
|  +--------------------------------------------+   |
|  | Add new cake photos           IN PROGRESS  |   |
|  | Submitted Jun 10                           |   |
|  +--------------------------------------------+   |
|  | Fix phone number on contact    COMPLETED   |   |
|  | Submitted Jun 5   |  Done Jun 5            |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Request Form Modal:**
- Category dropdown: Hours, Menu/Services, Photos, Content, Bug/Error, Other
- Description textarea (required, min 10 chars)
- Image upload (optional): drag-and-drop or file picker, max 5MB, stored in Supabase Storage
- Submit -> creates ticket, sends email notification to agency, shows toast "Request submitted! We'll get on it."

**Ticket Cards:**
- Status badges: NEW (blue), IN PROGRESS (amber), COMPLETED (green)
- Show category, description preview, dates
- Completed tickets show completion date
- Tap to expand and see full description + any agency response notes

---

### C8: Reviews

**Purpose:** See Google rating and send review requests to happy customers.

**Layout:**
```
+--------------------------------------------------+
|  Reviews                                           |
+--------------------------------------------------+
|                                                    |
|  YOUR GOOGLE RATING                               |
|  +--------------------------------------------+   |
|  | ++++*  4.8 / 5.0  (127 reviews)           |   |
|  | [Send Review Request]                      |   |
|  +--------------------------------------------+   |
|                                                    |
|  RECENT REVIEWS                                   |
|  +--------------------------------------------+   |
|  | +++++  Sarah T.               2 days ago   |   |
|  | "Amazing cakes! The wedding cake was        |   |
|  |  absolutely stunning and delicious..."      |   |
|  +--------------------------------------------+   |
|  | ++++*  Mike R.                1 week ago    |   |
|  | "Great cupcakes for our office party.       |   |
|  |  Everyone loved them!"                      |   |
|  +--------------------------------------------+   |
|                                                    |
|  REVIEW REQUESTS SENT                             |
|  +--------------------------------------------+   |
|  | 15 sent this month  |  3 completed (20%)   |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Send Review Request Flow:**
- "Send Review Request" -> opens contact selector
- Multi-select contacts from list (checkboxes)
- Preview email: "Hi {{first_name}}, thank you for choosing [business]. Would you take 30 seconds to leave us a Google review? [Direct Review Link]"
- Send button with count
- Tracks: sent, opened, review completed (if Google rating count increases)

**Google Reviews Display:**
- Gold star rating (SVG stars, filled/half/empty)
- Total count
- Recent reviews: star rating, author name, time ago, review text (truncated to 2 lines, expandable)

---

### C9: Appointments

**Purpose:** See upcoming appointments booked through the website widget.

**Layout:**
```
+--------------------------------------------------+
|  Appointments                                      |
+--------------------------------------------------+
|                                                    |
|  UPCOMING                                         |
|  +--------------------------------------------+   |
|  | TODAY                                       |   |
|  |   2:00 PM  Jane Doe - Cake Consultation    |   |
|  |            jane@email.com | (540) 555-7890 |   |
|  |            [Confirm] [Cancel]              |   |
|  +--------------------------------------------+   |
|  | TOMORROW                                    |   |
|  |   10:00 AM  Mike R. - Wedding Tasting      |   |
|  |             mike@email.com                 |   |
|  |             [Confirm] [Cancel]             |   |
|  +--------------------------------------------+   |
|  | THURSDAY, JUN 19                            |   |
|  |   3:30 PM  Sarah K. - Custom Order Pickup  |   |
|  +--------------------------------------------+   |
|                                                    |
|  AVAILABILITY SETTINGS              [Edit]        |
|  +--------------------------------------------+   |
|  | Mon-Fri: 9:00 AM - 5:00 PM                |   |
|  | Sat: 10:00 AM - 2:00 PM                   |   |
|  | Sun: Closed                                |   |
|  | Slot duration: 30 minutes                  |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Appointment List:**
- Grouped by day (Today, Tomorrow, then day name + date)
- Each appointment: time, customer name, appointment type, contact info
- Action buttons: Confirm (sends confirmation email), Cancel (sends cancellation + opens slot)
- Status indicators: Pending (amber dot), Confirmed (green dot), Cancelled (red strikethrough)

**Availability Settings:**
- Day-by-day toggle (Mon-Sun)
- For each active day: start time and end time (time picker dropdowns)
- Slot duration: 15min, 30min, 45min, 60min (dropdown)
- Buffer time between appointments: 0, 15, 30 min
- Save -> updates client record in Supabase

---

### C10: Reports

**Purpose:** Business owner shows their partner/spouse: "Look, our website is working."

**Layout:**
```
+--------------------------------------------------+
|  Reports                    [Download PDF]         |
+--------------------------------------------------+
|                                                    |
|  PERIOD: [This Month v]                           |
|                                                    |
|  WEBSITE VISITORS                                 |
|  +--------------------------------------------+   |
|  | [========= Line Chart: Daily visits =====] |   |
|  | Total: 1,247  |  Unique: 892  |  +12%     |   |
|  +--------------------------------------------+   |
|                                                    |
|  TOP PAGES                                        |
|  +--------------------------------------------+   |
|  | /              Home           547 visits    |   |
|  | /menu          Menu           312 visits    |   |
|  | /contact       Contact        198 visits    |   |
|  | /about         About          102 visits    |   |
|  | /catering      Catering        88 visits    |   |
|  +--------------------------------------------+   |
|                                                    |
|  LEAD GENERATION                                  |
|  +--------------------------------------------+   |
|  | [====== Bar Chart: Leads by week ========] |   |
|  | 7 new leads  |  3 won  |  $4,200 revenue  |   |
|  +--------------------------------------------+   |
|                                                    |
|  EMAIL MARKETING                                  |
|  +--------------------------------------------+   |
|  | 23 emails sent  |  34% open rate           |   |
|  | 142 total contacts  |  +8 new this month   |   |
|  +--------------------------------------------+   |
|                                                    |
|  GOOGLE REVIEWS                                   |
|  +--------------------------------------------+   |
|  | 4.8 stars  |  127 total  |  +4 this month  |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Period Selector:**
- Dropdown: This Week, This Month (default), Last Month, Last 3 Months, This Year

**Download PDF:**
- Button generates PDF client-side with jsPDF
- PDF includes: KG logo + client business name + date range as header
- All sections rendered as charts (canvas.toDataURL()) + formatted stats
- Clean, branded layout. White background, dark text, blue accents
- Footer: "Generated by KalnyesGrowth - kalnyesgrowth.com"

**Charts:**
- Line chart for visitors (existing Chart.js pattern)
- Bar chart for leads by week
- All charts match existing dark-tooltip, no-legend style

---

### C11: Settings (Client)

**Purpose:** Business owner manages their account basics.

**Layout:**
```
+--------------------------------------------------+
|  Settings                                          |
+--------------------------------------------------+
|                                                    |
|  BUSINESS INFORMATION                             |
|  +--------------------------------------------+   |
|  | Business Name:  The Icing Baking Company   |   |
|  | Email:          info@icingbaking.com        |   |
|  | Phone:          (540) 555-0123             |   |
|  | Website:        icingbaking.com            |   |
|  | Google Place ID: ChIJ...                   |   |
|  |                               [Edit]       |   |
|  +--------------------------------------------+   |
|                                                    |
|  NOTIFICATION PREFERENCES                         |
|  +--------------------------------------------+   |
|  | New lead alert (email)      [ON]           |   |
|  | Daily summary               [ON]           |   |
|  | Weekly report               [ON]           |   |
|  | Appointment reminders       [ON]           |   |
|  +--------------------------------------------+   |
|                                                    |
|  ACCOUNT                                          |
|  +--------------------------------------------+   |
|  | [Change Password]                          |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Notification Toggles:**
- Simple on/off switches
- Changes saved immediately to client preferences in Supabase
- Toast confirmation on toggle

---

### C12: Notifications (In-App)

**Purpose:** Don't miss anything important. Available from the bell icon.

**Bell Icon Behavior:**
- Shows in the top-right of mobile header and desktop sidebar
- Badge count: number of unread notifications (red dot with number)
- Tap bell -> dropdown (desktop) or bottom sheet (mobile)

**Notification Dropdown:**
```
+--------------------------------------+
|  Notifications              Mark all |
+--------------------------------------+
|  ** New lead from John Smith         |
|     "Looking for wedding cake..."    |
|     2 hours ago                      |
+--------------------------------------+
|  ** Review request completed!        |
|     Sarah T. left you a 5-star review|
|     5 hours ago                      |
+--------------------------------------+
|  Monthly report is ready             |
|  Download your June report           |
|  1 day ago                           |
+--------------------------------------+
|  Ticket completed: Update hours      |
|  Your website has been updated       |
|  2 days ago                          |
+--------------------------------------+
```

- Unread: bold text, blue left accent
- Read: normal weight, no accent
- "Mark all" link at top right -> marks all as read
- Tap notification -> navigates to relevant screen (lead detail, report, ticket, etc.)
- Max 20 shown, with "View all notifications" at bottom

---

## AGENCY DASHBOARD SCREENS

### A1: Agency Home

**Purpose:** JJ opens the app. See everything at a glance across all clients.

**Layout:**
```
+--------------------------------------------------+
|  Good morning, JJ                                 |
|  Tuesday, June 17, 2026                           |
+--------------------------------------------------+
|                                                    |
|  +--------+  +--------+  +--------+  +--------+  |
|  | CLIENTS|  |NEW LEAD|  | OPEN   |  | EMAILS |  |
|  |   5    |  |   12   |  |TICKETS |  | SENT   |  |
|  | active |  |  today |  |   3    |  | 89/mo  |  |
|  +--------+  +--------+  +--------+  +--------+  |
|                                                    |
|  NEEDS ATTENTION                                  |
|  +--------------------------------------------+   |
|  | ! 4 unread leads (2 clients)       [View]  |   |
|  | ! 1 new ticket from Icing Baking   [View]  |   |
|  | ! Pepe's site down (2 failed checks)[View] |   |
|  +--------------------------------------------+   |
|                                                    |
|  RECENT LEADS (ALL CLIENTS)                       |
|  +--------------------------------------------+   |
|  | [IC] Icing Baking  John Smith  NEW   2h    |   |
|  | [PP] Pepe's Party  Ana Garcia  NEW   4h    |   |
|  | [FC] FreshCut      Tom Brown CONTACTED 1d  |   |
|  +--------------------------------------------+   |
|                                                    |
|  CLIENT HEALTH                                    |
|  +--------------------------------------------+   |
|  | Icing Baking Co.  4.8*  7 leads  142 sub   |   |
|  | Pepe's Party      4.6*  3 leads   89 sub   |   |
|  | FreshCut Land.    4.9*  2 leads   67 sub   |   |
|  | Red Apple Tobacco 4.2*  1 lead    34 sub   |   |
|  | 610 Barber        4.7*  5 leads  201 sub   |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Needs Attention Section:**
- Sorted by urgency (most urgent first)
- Types: unread leads, open tickets, site down, sequences paused, review requests pending
- Each item: warning icon, description, client name, action button
- Yellow/amber background tint for urgency

**Client Health Table:**
- All clients in a compact table
- Columns: client (logo/initials + name), Google rating, leads this month, subscribers
- Color-coded: green if metrics trending up, red if trending down
- Tap row -> client detail view

---

### A2: All Clients

**Purpose:** Manage all clients. The existing view, enhanced.

**Layout (keep existing pattern, add columns):**
```
+--------------------------------------------------+
|  Clients (5)                     [+ Add Client]   |
+--------------------------------------------------+
|                                                    |
|  +--------------------------------------------+   |
|  | [IC]  The Icing Baking Company    ACTIVE   |   |
|  |       icingbaking.com                      |   |
|  |       7 leads | 142 contacts | 4.8*        |   |
|  |       [Dashboard] [Website] [Tracker]      |   |
|  +--------------------------------------------+   |
|  | [PP]  Pepe's Party Rental         ACTIVE   |   |
|  |       pepespartyrental.com                 |   |
|  |       3 leads | 89 contacts | 4.6*         |   |
|  |       [Dashboard] [Website] [Tracker]      |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Client Card Actions:**
- Dashboard: opens agency view of that client's full dashboard
- Website: opens client's live site in new tab
- Tracker: opens tracker snippet modal (existing)

**Add Client (existing, enhance):**
- Current modal works. Add fields: Google Place ID, booking page URL

---

### A3: All Leads (Agency View)

**Purpose:** See all leads across all clients in one view.

**Layout:**
```
+--------------------------------------------------+
|  All Leads                    [Filter] [Export]    |
+--------------------------------------------------+
|                                                    |
|  CLIENT: [All v]  STAGE: [All v]  DATE: [All v]  |
|                                                    |
|  +--------------------------------------------+   |
|  | [IC] John Smith        Icing Baking   NEW  |   |
|  |      john@email.com  2h ago                |   |
|  +--------------------------------------------+   |
|  | [PP] Ana Garcia        Pepe's Party   NEW  |   |
|  |      ana@email.com   4h ago                |   |
|  +--------------------------------------------+   |
|  | [FC] Tom Brown         FreshCut    CONTACT |   |
|  |      tom@email.com   1d ago                |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Filters:**
- Client dropdown: All, then each client name
- Stage dropdown: All, New, Contacted, Quoted, Won, Lost
- Date: Today, This Week, This Month, All Time
- Filters stack (AND logic)

**Export:**
- CSV export of filtered leads
- Columns: client, name, email, phone, message, stage, source, date

---

### A4: All Tickets (Agency View)

**Purpose:** See all website change requests across clients. JJ's task list.

**Layout:**
```
+--------------------------------------------------+
|  Tickets (3 open)              [Filter by status] |
+--------------------------------------------------+
|                                                    |
|  +--------------------------------------------+   |
|  | [IC] Update hours          Icing Baking    |   |
|  |      Category: Hours  |  Status: NEW       |   |
|  |      Jun 14           |  [Start] [Done]    |   |
|  +--------------------------------------------+   |
|  | [PP] Add new photos        Pepe's Party    |   |
|  |      Category: Photos |  Status: IN PROG   |   |
|  |      Jun 10           |  [Done]            |   |
|  +--------------------------------------------+   |
|  | [FC] Fix contact form      FreshCut        |   |
|  |      Category: Bug    |  Status: NEW       |   |
|  |      Jun 15           |  [Start] [Done]    |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Ticket Actions (Agency Only):**
- "Start" -> changes status to IN PROGRESS, notifies client
- "Done" -> changes status to COMPLETED, notifies client
- Add agency notes (internal, not visible to client)
- Status changes trigger email to client

---

### A5: Campaign Manager (Agency View)

**Purpose:** Manage email sequences and broadcasts across all clients.

**Layout:**
```
+--------------------------------------------------+
|  Campaigns                                         |
+--------------------------------------------------+
|                                                    |
|  ACTIVE SEQUENCES                                 |
|  +--------------------------------------------+   |
|  | [IC] Welcome Sequence     Icing Baking     |   |
|  |      12 enrolled | 8 completed | 67% rate  |   |
|  +--------------------------------------------+   |
|  | [PP] Lead Follow-Up       Pepe's Party     |   |
|  |      4 enrolled  | 2 completed | 50% rate  |   |
|  +--------------------------------------------+   |
|                                                    |
|  RECENT BROADCASTS                                |
|  +--------------------------------------------+   |
|  | [IC] "Summer Special"   142 sent  38% open |   |
|  | [FC] "Spring Cleanup"   67 sent   31% open |   |
|  +--------------------------------------------+   |
|                                                    |
|  SEQUENCE TEMPLATES            [+ New Template]   |
|  +--------------------------------------------+   |
|  | Welcome Series        3 steps  [Deploy ->] |   |
|  | Lead Follow-Up        3 steps  [Deploy ->] |   |
|  | Review Request        2 steps  [Deploy ->] |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Deploy Template:**
- Select client -> creates a copy of the sequence for that client
- Client can then customize the copy from their dashboard

---

### A6: Revenue & Billing (Agency View)

**Purpose:** Track monthly retainer revenue and client billing status.

**Layout:**
```
+--------------------------------------------------+
|  Revenue                                           |
+--------------------------------------------------+
|                                                    |
|  MONTHLY RECURRING                                |
|  +--------------------------------------------+   |
|  | $2,500/mo         5 active clients         |   |
|  | [====== Line Chart: MRR trend ===========] |   |
|  +--------------------------------------------+   |
|                                                    |
|  CLIENT BILLING                                   |
|  +--------------------------------------------+   |
|  | Icing Baking    $500/mo   PAID    Jun 1    |   |
|  | Pepe's Party    $500/mo   PAID    Jun 1    |   |
|  | FreshCut        $500/mo   OVERDUE May 1    |   |
|  | Red Apple       $500/mo   PAID    Jun 1    |   |
|  | 610 Barber      $500/mo   PAID    Jun 1    |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Billing Status:**
- Simple tracking: client, amount, status (PAID/OVERDUE/PENDING), last payment date
- Manual updates (JJ marks as paid when payment received)
- OVERDUE shown in red with days overdue count
- No automated billing (just tracking, JJ collects manually for now)

---

### A7: Tracker Snippets (Agency View)

**Purpose:** Generate and manage tracking code for each client's website.

**Already exists in Settings.** Keep it there but also accessible from client cards in A2.

---

### A8: Report Generator (Agency View)

**Purpose:** Generate PDF reports for any client on demand.

**Layout:**
```
+--------------------------------------------------+
|  Reports                                           |
+--------------------------------------------------+
|                                                    |
|  GENERATE REPORT                                  |
|  +--------------------------------------------+   |
|  | Client: [Select v]                         |   |
|  | Period: [This Month v]                     |   |
|  | [Generate PDF]  [Send to Client]           |   |
|  +--------------------------------------------+   |
|                                                    |
|  RECENT REPORTS                                   |
|  +--------------------------------------------+   |
|  | Icing Baking - June 2026    [Download]     |   |
|  | Pepe's Party - June 2026    [Download]     |   |
|  | All Clients  - May 2026     [Download]     |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

**Generate PDF:**
- Select client (or "All Clients" for agency summary)
- Select period
- "Generate PDF" -> downloads immediately
- "Send to Client" -> generates PDF + emails to client with message "Your monthly report is ready"

**Agency Summary PDF:**
- Covers all clients in one document
- Per-client section with their key metrics
- Summary section at top: total MRR, total leads, total subscribers across all clients

---

### A9: Agency Settings

**Purpose:** Manage agency-level configuration.

**Layout:**
```
+--------------------------------------------------+
|  Settings                                          |
+--------------------------------------------------+
|                                                    |
|  AGENCY PROFILE                                   |
|  +--------------------------------------------+   |
|  | Agency Name:  KalnyesGrowth                |   |
|  | Email:        kalnyesgrowth@gmail.com      |   |
|  | Phone:        540-783-8835                 |   |
|  | Website:      kalnyesgrowth.com            |   |
|  +--------------------------------------------+   |
|                                                    |
|  CLIENT MANAGEMENT                                |
|  +--------------------------------------------+   |
|  | [+ Add Client]  [Manage Credentials]       |   |
|  +--------------------------------------------+   |
|                                                    |
|  TRACKER SNIPPETS                                 |
|  +--------------------------------------------+   |
|  | [Generate for client v]   [Copy Snippet]   |   |
|  +--------------------------------------------+   |
|                                                    |
|  EMAIL CONFIGURATION                              |
|  +--------------------------------------------+   |
|  | From Name:    KalnyesGrowth                |   |
|  | Reply-To:     kalnyesgrowth@gmail.com      |   |
|  | Daily limit:  100/day (Resend free tier)   |   |
|  | Used today:   23/100                       |   |
|  +--------------------------------------------+   |
|                                                    |
|  INTEGRATIONS                                     |
|  +--------------------------------------------+   |
|  | Supabase:  Connected              [Test]   |   |
|  | Resend:    Connected (23/100)     [Test]   |   |
|  | Twilio:    Not configured         [Setup]  |   |
|  +--------------------------------------------+   |
|                                                    |
|  DANGER ZONE                                      |
|  +--------------------------------------------+   |
|  | [Export All Data]  [Delete Client...]       |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

---

## SHARED COMPONENTS

### Toast Notifications
- Bottom-center (mobile) or bottom-right (desktop)
- Auto-dismiss after 2.4 seconds (existing pattern)
- Types: success (green left border), error (red), info (blue), warning (amber)

### Empty States
- Every list view needs an empty state
- Pattern: centered SVG icon (48px, muted) + heading + description + optional CTA button
- Examples:
  - Leads: inbox icon, "No leads yet", "Leads appear when someone fills out your website's contact form"
  - Contacts: people icon, "No contacts yet", "Add your first contact or import from CSV"
  - Sequences: mail icon, "No sequences yet", "Create an automated email sequence to engage your customers"

### Skeleton Loaders
- Existing pattern: pulsing gray rectangles while data loads
- Apply to every data-dependent section
- Match the approximate layout of the real content

### Confirmation Dialogs
- Used for: delete actions, sending emails to many recipients, cancelling appointments
- Modal overlay with title, description, Cancel (ghost) and Confirm (solid, red for destructive) buttons
- Never use browser `confirm()`. Always custom modal matching the design system.

### Form Patterns
- Labels above inputs, 0.75rem, weight 600, secondary color
- Inputs: white background, 1px border (--border), 8px radius, 40px height, 14px text
- Focus state: blue border, subtle blue shadow
- Error state: red border, red helper text below
- Required indicator: red asterisk after label
- Submit buttons: full-width on mobile, right-aligned on desktop

### Mobile-Specific Patterns
- Cards take full width with 12px horizontal margin
- Touch targets: minimum 44px height for all interactive elements
- Pull-to-refresh on list views (optional enhancement)
- Swipe actions on list items: swipe left to reveal "Delete" or "Archive" (optional)
- Bottom sheet modals instead of centered modals on mobile (slides up from bottom)

---

## INTERACTION PATTERNS

### Navigation Flow
- Max 3 taps from home to any action
- Back button always available (breadcrumb pattern on desktop, back arrow on mobile header)
- Deep links work: #leads, #leads/abc123, #contacts, #contacts/def456, #email, #reviews, etc.
- Browser back/forward works correctly (hash-based routing, existing pattern)

### Data Loading
- Show skeleton immediately, fetch in background
- If fetch fails: show error state with retry button, not an empty page
- Cache last-known-good data in localStorage for instant display on return visits
- Stale data shown immediately, fresh data replaces it when fetch completes (stale-while-revalidate)

### Real-Time Updates
- Supabase Realtime subscriptions for: leads (new lead appears instantly), notifications (badge updates)
- Not everything needs real-time. Contacts, reports, reviews can refresh on navigation.

### Offline Behavior (PWA)
- Service worker already exists
- Show cached data when offline
- Queue actions (add note, change stage) and sync when back online
- Show "Offline" banner at top when disconnected

---

## SCREEN INVENTORY SUMMARY

### Client Dashboard (9 screens + notifications)
| # | Screen | Route | Priority |
|---|--------|-------|----------|
| C1 | Home/Overview | #home | Tier 1 |
| C2 | Lead Inbox | #leads | Tier 1 |
| C3 | Lead Detail | #leads/:id | Tier 1 |
| C4 | Contacts | #contacts | Tier 1 |
| C5 | Contact Detail | #contacts/:id | Tier 1 |
| C6 | Email Marketing | #email | Tier 1 |
| C7 | Website Changes | #tickets | Tier 2 |
| C8 | Reviews | #reviews | Tier 2 |
| C9 | Appointments | #appointments | Tier 2 |
| C10 | Reports | #reports | Tier 2 |
| C11 | Settings | #settings | Tier 1 |
| C12 | Notifications | dropdown/sheet | Tier 1 |

### Agency Dashboard (9 screens)
| # | Screen | Route | Priority |
|---|--------|-------|----------|
| A1 | Agency Home | #home | Tier 1 |
| A2 | All Clients | #clients | Tier 1 |
| A3 | All Leads | #leads | Tier 1 |
| A4 | All Tickets | #tickets | Tier 2 |
| A5 | Campaign Manager | #campaigns | Tier 1 |
| A6 | Revenue & Billing | #revenue | Tier 2 |
| A7 | Tracker Snippets | (in settings) | Tier 1 |
| A8 | Report Generator | #reports | Tier 2 |
| A9 | Agency Settings | #settings | Tier 1 |

### Total: 18 unique screens + notification system

---

## WHAT THE CLIENT NEVER SEES

The client dashboard is deliberately simpler than the agency dashboard. Clients never see:
- Other clients' data (enforced by RLS, not just UI)
- Revenue/billing section
- Tracker snippet code
- Agency internal notes on tickets
- Campaign templates (they see deployed sequences, not the template library)
- System health/uptime data (agency monitors this, client just sees their site is working)

---

## LANGUAGE RULES

These business owners are not tech people. Every label, button, and description must use plain English.

| Technical Term | What the Client Sees |
|---------------|---------------------|
| Leads | People who contacted you |
| Contacts | Your customers |
| Sequences | Automated emails |
| Broadcasts | Email blasts |
| Subscribers | Email list |
| Pipeline stages | Lead status |
| CTA | Button |
| Form submission | Contact form message |
| Bounce rate | (don't show) |
| Conversion rate | (don't show, show "X people took action" instead) |
| RLS | (never mention) |
| Edge function | (never mention) |
| API | (never mention) |

---

## SUCCESS CRITERIA

The design is correct when:

1. A business owner can check their leads from their phone while standing at the register, in under 10 seconds
2. They can call back a lead with 2 taps (open lead -> tap phone number)
3. They can see "how's my website doing" with 1 tap (home screen shows it)
4. They never encounter a word they don't understand
5. JJ can see all clients' leads in one screen without switching between accounts
6. JJ can mark a ticket as done and the client gets notified automatically
7. Every screen loads in under 2 seconds on a phone
8. No screen requires horizontal scrolling on any device
9. The app feels like a product, not a spreadsheet
