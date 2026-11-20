# Security Specification — 3DBYSD Smart Reviews

## 1. Roles & Authentication Trust Model
- **Master Admin**: Firebase Auth user with `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email.lower() == '66shashwatkumar66@gmail.com'`.
- **Sub-Admin / Assigned Card Owner**: Firebase Auth user with `request.auth != null && request.auth.token.email_verified == true` who owns specific cards via `assignedToUid == request.auth.uid` or `assignedToEmail == request.auth.token.email.lower()`.
- **Public Customer (Unauthenticated)**: Scans a QR or NFC stand by exact `cardId` (`/r/:id`), views active sponsor ads, increments scan count (+1), logs a scan event, and records ad impressions/clicks (+1).

## 2. Collection Access Matrix

### `/cards/{cardId}`
- `get`: Public allowed for valid card IDs (`isValidId(cardId)`) so customers can scan a QR/NFC card without signing in.
- `list`: **Master Admin** (all cards) OR **Sub-Admin** ONLY for cards where `resource.data.assignedToUid == request.auth.uid || (hasVerifiedEmail() && resource.data.assignedToEmail.lower() == request.auth.token.email.lower())`. Unauthenticated `list` is **DENIED** to prevent leaking all business cards and admin emails.
- `create`: Master Admin only, validated schema.
- `update`:
  - Master Admin: full validated update (card `id` immutable).
  - Assigned Sub-Admin / Owner: may update business customization fields (`businessName`, `category`, `googleReviewUrl`, `notes`, `aiReviewEnabled`, `customKeywords`, `reviewTone`, `promptStarter`, `customHeadline`, `logoUrl`, `whatsapp`, `instagram`, `status` in `['available','assigned']`, `updatedAt`) ONLY on cards already assigned to them. Immutable fields for Sub-Admin: `id`, `createdAt`, `scansCount`, `assignedToUid`, `assignedToEmail`, `assignedToName`, `subscriptionStartDate`, `subscriptionEndDate`, `subscriptionStatus`.
  - Public Scan Counter Increment: may ONLY increment `scansCount` by exactly `+1` (or initialize from missing/0 to `1`) and update `updatedAt` / `lastScannedAt`, keeping every other field unchanged.
- `delete`: Master Admin only.

### `/scan_logs/{logId}`
- `get`, `list`: **Master Admin** (all scan logs) OR **Sub-Admin** ONLY for logs where `resource.data.assignedToUid == request.auth.uid || (hasVerifiedEmail() && resource.data.assignedToEmail.lower() == request.auth.token.email.lower())`.
- `create`: Public allowed ONLY when referencing an existing `/cards/{cardId}` document (`exists(...)`), with `assignedToEmail` and `assignedToUid` matching the parent card's assignment fields (preventing log injection into another sub-admin's feed), strict enum validation on `source`, `outcome`, `subscriptionStatus`, bounded strings, and strict key allowlist.
- `update`, `delete`: **DENIED** (`false`). Historical QR scan logs are append-only and immutable.

### `/admins/{adminId}`
- `get`, `list`: Master Admin OR signed-in user with verified email matching `resource.data.email.lower() == request.auth.token.email.lower()`.
- `create`, `update`, `delete`: Master Admin only, validated schema.

### `/users/{userId}`
- `get`: Master Admin OR owner (`request.auth.uid == userId`).
- `list`: Master Admin only.
- `create`: Master Admin OR owner (`request.auth.uid == userId`) with `role == 'member'` (or `'master'` ONLY if `isMasterAdmin()`) to prevent privilege escalation.
- `update`: Master Admin OR owner (`request.auth.uid == userId`) keeping `uid`, `email`, and `role` strictly unchanged.
- `delete`: Master Admin only.

### `/ads/{adId}`
- `get`, `list`: Public read allowed (sponsor marketing banners contain no PII).
- `create`, `delete`: Master Admin only, validated schema.
- `update`: Master Admin (validated) OR Public atomic metric increment (+1 on `impressions` or +1 on `clicks` only, keeping all other fields unchanged).

### `/test/{docId}`
- `get`: Public allowed ONLY for `docId == 'connection'` (connectivity check).
- `list`, `write`: Denied (`false`).

### Default Deny
- `match /{document=**} { allow read, write: if false; }`

## 3. Red Team Threat Checklist
1. Email spoofing without verification: Blocked by `request.auth.token.email_verified == true`.
2. Privilege escalation via `/users/{uid}` role self-assignment: Blocked by restricting self-create `role == 'member'` and self-update `incoming().role == existing().role`.
3. Public collection scraping of `/cards`: Blocked by removing `allow list: if true`.
4. Unauthenticated `TEST-*` card backdoor: Removed completely.
5. Sub-admin accessing or reassigning another sub-admin's card: Blocked by ownership check + immutable ownership/subscription fields on Sub-Admin update.
6. Scan log tampering or deletion: Blocked by `allow update, delete: if false`.
7. Fake scan logs injected for non-existent cards or forged `assignedToEmail`: Blocked by `exists()` + parent card field match on `scan_logs` create.
8. Public overwriting `scansCount` to arbitrary values or altering card business fields: Blocked by strict `+1` delta check and `affectedKeys().hasOnly(...)`.
