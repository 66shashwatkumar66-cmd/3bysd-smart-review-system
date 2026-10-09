# Dynamic QR Code Management Platform & AI Review Assistant

A production-grade platform for single and bulk dynamic QR code generation with sequential cross-check numbering (`0001`, `0002`...), dynamic business assignment, printable card sheet exports, and a mobile-optimized customer AI review assistant that drafts natural reviews and redirects directly to Google Business Profile review pages.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed through user preferences and project specifications:

- **Confirmed Decision 1: Numbering Scheme**: 4-digit zero-padded format (`0001`, `0002`, `0003`...) by default, with custom starting offset and optional prefix support (e.g. `SD-0001`), enabling easy physical-to-digital inventory cross-checking.
- **Confirmed Decision 2: QR Export & Print**: Both printable multi-card batch sheets (designed for print shops and cutting grids with card ID badges, cut marks, and custom business branding) plus single high-resolution SVG and PNG downloads.
- **Confirmed Decision 3: Customer Mobile Experience**: Streamlined, thumb-friendly mobile flow featuring 1–5 star rating, 6 curated experience tags (Food & Drinks, Friendly Staff, Ambience, Fast Service, Value for Money, Overall Experience), optional customer custom notes, one-click Gemini AI review generation, editable draft, copy confirmation, and direct "Continue to Google Review" handoff.
- **Confirmed Decision 4: Architecture & Persistence**: Dual-layer storage (server-side API persistence with local fallback synchronization) ensuring pre-printed cards can be generated first and dynamically assigned or reassigned to any Google Review link anytime without reprinting.

---

## 1. Overview & Core Concept

### What It Does
1. **Dynamic QR Code Engine**: Generates single or batch QR codes tied to permanent, short URLs (e.g., `/r/0001`). Cards can be printed, laminated, or 3D-printed with NFC tags before knowing the client.
2. **Admin Command Center**: Real-time dashboard to monitor all cards, search by ID or business name, filter by status (`unassigned`, `assigned`, `disabled`), assign or reassign URLs and business details, and generate new batches with one click.
3. **Print & Export Suite**: Interactive print sheet preview generator (A4/Letter grid with card cut-lines, QR code, card ID `#0001`, and "Tap NFC or Scan QR" branding) alongside instant SVG/PNG exports.
4. **Mobile AI Review Assistant**: When a customer scans a card at a café or restaurant, they enter a warm, responsive mobile web app. They select their star rating, tap relevant highlights, add any personal note, and tap "Generate Review". Gemini drafts a personalized, natural review. The customer can edit it, tap "Copy & Open Google Review", which copies the text to their clipboard and automatically opens the business's direct Google Review submission page.

### Target Audience & Persona
- **Hospitality & Retail Operators**: Cafés, restaurants, salons, boutiques, and bakeries seeking more 5-star Google reviews.
- **Brand & NFC Hardware Manufacturers (3DBYSD / SD Studios)**: Producing pre-printed batches of physical review stands and NFC cards in bulk for distribution.
- **Everyday Customers**: Scanning from a mobile phone at a table, requiring zero friction, no app download, fast loading, and tactile 48px touch targets.

---

## 2. User Experience & Visual Design

### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                          ADMINISTRATOR WORKFLOW                        │
├───────────────┬───────────────────────────┬────────────────────────────┤
│ 1. Batch Gen  │ 2. Assign Business        │ 3. Print & Distribute      │
│ Choose count  │ Pick card '#0012'         │ Download high-res sheet or │
│ (e.g. 50 cards) Enter Cafe name & Google  │ SVG/PNG. Print stands.     │
│ Auto-allocates  Review direct URL. Save.  │ Card is ready for tables.  │
│ 0001 to 0050. │ Permanent URL active.     │                            │
└───────────────┴───────────────────────────┴────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER WORKFLOW                            │
├───────────────┬───────────────────────────┬────────────────────────────┤
│ 1. Scan/Tap   │ 2. AI Review Assistant    │ 3. Copy & Google Handoff   │
│ Customer scans│ Select 5 Stars & Tags     │ Customer reviews/edits     │
│ QR code at    │ (e.g., 'Friendly Staff',  │ draft. Clicks 'Copy & Open │
│ table ->      │ 'Food & Drinks') + Note.  │ Google'. Review copied and │
│ Opens /r/0012 │ Clicks 'Generate Review'. │ Google review page opens.  │
└───────────────┴───────────────────────────┴────────────────────────────┘
```

### Visual Identity & Theme
- **Color Palette & Discipline (60-30-10)**:
  - *60% Neutral Canvas*: Crisp slate-50 (`#F8FAFC`) with pure white (`#FFFFFF`) card surfaces.
  - *30% Structural Surfaces*: Subtle hairline slate borders (`border-slate-200/80`), deep slate typography (`#0F172A`), muted metadata (`#64748B`).
  - *10% Accent Intent*: Google-inspired primary blue (`#2563EB`) and warm gold rating stars (`#F59E0B`), emerald for assigned badges (`#10B981`).
- **Typography & Scale**:
  - Headings & Brand: Plus Jakarta Sans with refined weight and balanced headline wrapping (`text-wrap: balance`).
  - Card Numbers & Telemetry: Monospace tabular numerals (`font-mono tabular-nums`) for `#0001`, `#0002` cross-checking.
  - Body: Readable, clean sans (`text-sm` and `text-base` with generous line-height).
- **Anti-Slop Discipline**:
  - No fake AI scores or arbitrary innovation percentages.
  - Unboxed metadata with typographic `·` and `/` separators.
  - Plain, everyday action buttons ("Generate Review", "Copy & Go to Google", "Assign Business", "Download Sheet").
  - Dedicated Mobile Preview Mode directly in the admin dashboard to test customer experience in real-time.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Permanent URL Routing (`/r/[id]`)**:
  - *Chosen Approach*: Physical QR codes encode only `https://domain/r/0001`. The server and client look up card `0001` in the database to resolve its target Google Review URL.
  - *Why*: Allows manufacturing hundreds of cards in advance. If a business changes Google review links or changes owners, only the digital assignment changes—the physical QR code never needs reprinting.
- **Decision 2: Server-Side Gemini API Integration**:
  - *Chosen Approach*: Gemini API (`gemini-3.8-flash`) executed via server route `/api/generate-review` using `@google/genai` SDK with strict anti-hallucination prompt rules (natural tone, strictly honest, no invented food or prices).
  - *Why*: Securely isolates API keys on the server, avoiding any browser key exposure, while maintaining sub-second review generation.
- **Decision 3: Direct Clipboard + New Tab Google Handoff**:
  - *Chosen Approach*: Native Clipboard API writes the edited review to the user's phone clipboard and immediately triggers `window.open(googleReviewUrl, '_blank')`, paired with an on-screen toast and sticky fall-through button if popup blockers intercept the redirect.
  - *Why*: Google does not allow 3rd-party websites to inject reviews directly into Google Maps without user confirmation; copying to clipboard + direct deep link is the industry gold standard used by leading NFC card makers.
- **Decision 4: Multi-View Admin Panel with Live Mobile Simulator**:
  - *Chosen Approach*: Admin panel includes Cards List/Grid, Batch Generation Wizard, Print Sheet Generator, and an interactive Phone Simulator tab so the admin can test how any card looks on a mobile device immediately.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VITE / EXPRESS FULL-STACK                       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │                 API Server Routes (Node.js)                  │     │
│   │                                                              │     │
│   │   POST /api/generate-review  <---> @google/genai             │     │
│   │   GET  /api/cards                  (gemini-3.8-flash)        │     │
│   │   POST /api/cards/batch                                      │     │
│   │   PUT  /api/cards/:id/assign                                 │     │
│   └──────────────────────────────┬───────────────────────────────┘     │
│                                  │                                     │
│   ┌──────────────────────────────┴───────────────────────────────┐     │
│   │                   React Single-Page Client                   │     │
│   ├──────────────────────────────┬───────────────────────────────┤     │
│   │  ADMIN CONSOLE (/admin)      │  CUSTOMER REVIEW (/r/:cardId) │     │
│   │  • Batch Generator Form      │  • Dynamic Card Resolver      │     │
│   │  • Card Inventory Table      │  • Star Rating (1-5)          │     │
│   │  • Search & Status Filters   │  • Experience Tag Multi-Select│     │
│   │  • Business Assignment Modal │  • Custom Notes Input         │     │
│   │  • Printable Sheet Generator │  • Gemini Review Generator    │     │
│   │  • High-Res SVG/PNG Exporter │  • Edit Draft & Copy Action   │     │
│   │  • Live Mobile Simulator     │  • Direct Google Redirect     │     │
│   └──────────────────────────────┴───────────────────────────────┘     │
│                                  │                                     │
│   ┌──────────────────────────────┴───────────────────────────────┐     │
│   │              Data Persistence & QR Code Engine               │     │
│   │   • LocalStorage + Server State Synchronization              │     │
│   │   • qrcode client/vector SVG & canvas rasterizer             │     │
│   │   • Zero-padding formatter (padCardId: 1 -> '0001')          │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

```typescript
interface CardRecord {
  id: string;              // e.g. "0001", "0002", "0050"
  status: 'available' | 'assigned' | 'disabled';
  businessName: string;    // e.g. "SD Artisan Café & Roastery"
  category?: string;       // e.g. "Café / Specialty Coffee"
  googleReviewUrl: string; // e.g. "https://g.page/r/CbXxExample/review"
  notes?: string;          // Admin notes, e.g. "Table 4 Stand"
  scansCount: number;      // Analytics scan counter
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}
```

### Interactive Component & State Mapping

1. **Card Assignment Modal**:
   - Inputs: Business Name, Google Review URL (with URL validator & guide on where to get direct Google review links), Category, Notes.
   - Updates status from `available` to `assigned`.
2. **Batch Generator Modal**:
   - Inputs: Number of cards to generate (e.g. 5, 20, 50, 100), Starting number (e.g. 1 or custom), Padding digits (default 4 -> `0001`), Prefix (optional).
   - Generates sequential IDs and pre-computes permanent URLs.
3. **Printable Sheet View**:
   - Layout: Standard A4 / US Letter grid of printable cards with QR code, Card ID `#0001`, NFC instruction text, and dashed cut lines.
   - Built-in browser print styling (`@media print`) so users can print directly or save to PDF.
4. **Customer Review Generator (`/r/:id`)**:
   - Star selector (1 to 5 stars) with friendly rating labels.
   - Quick tags: `Food & Drinks`, `Friendly Staff`, `Cosy Ambience`, `Fast Service`, `Great Value`, `Clean & Welcoming`.
   - Customer notes: Optional textarea for custom dishes, barista names, or special experiences.
   - Review generation state: Loading skeleton with reassuring status -> editable draft -> copy confirmation feedback -> "Continue to Google Review" link opening.
