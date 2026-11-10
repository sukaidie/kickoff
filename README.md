# Kickoff

English-only, mobile-first football scheduling for Düsseldorf. Vite + vanilla JavaScript + Supabase, deployed as a static GitHub Pages site at `/kickoff/`.

## Development

Node.js 24 and npm are required.

```sh
npm ci
cp .env.example .env.local
# Fill in the two public Supabase settings described below.
npm run dev
npm test
npm run build
```

`npm run test:e2e` runs Chromium UI checks at mobile and desktop sizes. The provided cloud environment has `/usr/bin/chromium`; on another machine install Chromium and update the executable path in `playwright.config.js`.

Development and production both use the public project URL and publishable key in `src/public-config.js`; environment variables override them. It does not silently store local matches or pretend data is shared.

## Required Supabase setup

1. Create a Supabase project. Run `supabase/schema.sql` **once** in its SQL editor. This creates the schema, row-level security, restricted write functions, and Realtime publication membership. The migration is transactional, not designed to be rerun over existing tables.
2. Enable **Anonymous Sign-Ins** under Authentication → Sign In / Providers. Visitors get an anonymous identity automatically; no email, password, or registration UI is needed. Configure the production site URL as `https://sukaidie.github.io/kickoff/`.
3. Set `VITE_SUPABASE_URL` to the project's HTTPS URL and `VITE_SUPABASE_ANON_KEY` to its **public publishable or legacy anon key**. Never use a service-role/secret key. For local development put these in ignored `.env.local`.
4. In GitHub repository Settings → Secrets and variables → Actions → **Variables**, add the same two names. These are deliberately public browser configuration. Rerun the Pages workflow after setting or changing them.
5. Validate with two browsers: create a future match, join from the other browser, verify both lists and cost shares update, verify only the organiser can cancel, then verify joining the cancelled match fails. Realtime updates have a ten-second polling fallback.

**Current setup:** the production project URL and public publishable key are configured. Hosted Supabase Auth, Realtime, and shared persistence remain unverified until the schema is installed and anonymous sign-in is enabled. The SQL migration and access-control operations are tested against embedded PostgreSQL with a simulated `auth.uid()` and Supabase roles; this does not substitute for the hosted integration check.

### Access and privacy

Authenticated anonymous visitors can read the schedule and public player names. Direct table inserts and updates are denied. Only the match creator may delete their match through a row-level security policy; deletion also removes its player entries. Security-definer functions require `auth.uid()`, derive ownership from that identity, enforce one player per identity per match, validate names/venues/times, reject past or cancelled games, and permit cancellation only by the organiser. Match creation is atomic with the organiser's entry. Join/leave operations lock the match row to serialize with cancellation. Creation is limited to 20 matches per identity per day.

Anonymous access is intentionally open, not identity verification. Clearing browser storage loses control of that identity's entries and created matches. New identities can bypass per-identity limits; monitor Supabase abuse and configure Auth rate limits before a broad launch. Names are public, so avoid sensitive information. Payments are amounts due, not payment collection or verified payment status.

## Rules

- Venues: Cosmo and Merkur Spiel-Arena. Merkur matches are **Free**, with no venue fee or per-player payment.
- 0–14 players: 90 minutes. 15+ players: 120 minutes. Leaving can reduce duration again.
- Cosmo: weekdays 10:00–14:00 €40/h, 14:00–17:00 €64/h, 17:00–22:00 €80/h. Weekends and all NRW statewide public holidays: €76/h. Minute-by-minute calculation splits a booking across rate bands.
- NRW holidays include New Year, Good Friday, Easter Monday, Labour Day, Ascension, Whit Monday, Corpus Christi, German Unity Day, All Saints, and both Christmas holidays.
- New Cosmo kick-offs must be between 10:00 and 20:00 to accommodate an automatic two-hour game before 22:00. Dates are interpreted in Europe/Berlin, independently of the visitor's timezone.
- Cost shares sum exactly to the total, with any extra cents assigned by stable join order. The headline displays the maximum individual share when rounding differs.
- Cancellation: more than 48 hours → 100% voucher; 24 through 48 hours inclusive → 50%; less than 24 hours → none. Exactly 48 hours is treated as the 50% band. Estimates refer to the match total. Venue bookings, cancellation requests, voucher issuance, and payments happen outside this site.

## GitHub Pages

The `.github/workflows/pages.yml` workflow installs from the lockfile, tests, builds with `/kickoff/` as its base, and deploys the `dist` artifact on pushes to `main` or manual dispatch.

Enable GitHub Pages in repository Settings → Pages, with **GitHub Actions** as the source. The workflow needs Pages write and OIDC permissions, and the default `github-pages` environment must permit `main`. GitHub API access may be separately restricted even when Git push works. Until a successful Pages workflow and HTTP request are verified, the expected URL `https://sukaidie.github.io/kickoff/` should not be assumed live.

## Updating an existing project: delete matches

Run `supabase/migrations/20261030_owner_delete_matches.sql` in the Supabase SQL Editor (safe to rerun). Do not rerun the initial schema. The **Delete match** button is available to the creator on upcoming, finished, and cancelled matches, with permanent-deletion confirmation. It does not cancel a venue booking. Use the same browser identity that created the test match; another anonymous identity cannot delete it.

## Updating an existing project: host management

Run `supabase/migrations/20261030_host_management.sql` in the Supabase SQL Editor. It is transactional, safe to rerun, and preserves current matches and players. Do not rerun the initial schema. New installations already include these capabilities in `schema.sql`.

For upcoming, uncancelled matches the host can:

- **Edit match**: change the title, venue, date and kick-off time. Duration, end time, costs and voucher eligibility recalculate.
- **Add someone else**: create a named guest entry without requiring the guest's device.
- **Edit / Remove** beside a player: rename an entry or remove it after confirmation.

All four operations check `auth.uid()` against the match owner inside restricted database functions and lock the match row. They cannot change ownership, link a guest to another identity, manage players from another match, or modify closed matches. Existing participant self-join and leave continue to work. Removal is not a ban; the participant can join again while the match is open.

Additional player entries have a null `user_id`, a **Player** label, and an `added_by` owner. The person who adds an entry and the host can manage it; typing the same name from another browser does not claim it. The host remains the organiser even if their own player entry is removed. Venue booking changes must be arranged separately. Host privileges still depend on retaining the original anonymous browser session.

## Updating an existing project: multiple players per user

Run `supabase/migrations/20261030_multiple_players.sql` in the Supabase SQL Editor. It is transactional, safe to rerun, and preserves existing registrations. It adds `players.added_by`, backfills ownership of self-joined entries to that user and old host-added entries to the match host, and installs restricted player-management functions. Do not rerun the initial schema. New installations include this in `schema.sql`.

Every signed-in anonymous visitor can **Add someone else** multiple times, even without joining personally. They can edit or remove their own primary registration and the extra entries they added; the host can manage everyone's entries. **Click to join / Leave match** still applies only to the user's own primary entry. Leaving does not remove other people they registered. One primary entry per browser identity per match remains enforced.

Additional entries cannot impersonate a browser identity or transfer match ownership. Add/edit/remove are disabled for cancelled or started matches and recheck permissions in the database. All players count toward duration (15+ = 120 minutes), costs, and visible numbering. As with all anonymous identities, clearing browser storage loses management access.

## Schedule views

The homepage opens on **Upcoming matches**, showing uncancelled matches with a future kick-off, earliest first. **Past matches** contains started/past matches and cancelled matches, most recent scheduled date first. These replace venue filters and include both venues.

## Updating an existing project: completed Cosmo payment status

Run `supabase/migrations/20261030_player_payments.sql` in the Supabase SQL Editor (transactional and safe to rerun). Do not rerun `schema.sql`. It adds an unpaid-by-default `paid` field plus the last update time and host identity; existing entries are preserved.

Every uncancelled **Cosmo** match shows **Player / Amount / Status**, before, during and after play. New entries default to **Unpaid**. Everyone can view the status; only the match's host can change it through the separate **Edit payment status** dialog. Player rows display plain, non-interactive status text. The database independently enforces venue, ownership, player membership. No payment controls or statuses appear for Merkur or cancelled matches. Status is a manual record, not a payment processor confirmation; no funds are collected. Changing it never changes costs or attendance.

### Completed test match

After applying the migration and deploying, open `https://sukaidie.github.io/kickoff/?payment-demo=1` in the browser identity you want to act as host. Click **Create payment demo**. The restricted `create_payment_demo()` function inserts a clearly named **TEST · Cosmo payment status** match yesterday at 18:00 in Europe/Berlin, owned by the current browser identity, with three fictional entries and a mix of paid and unpaid statuses. It opens in **Past matches**.

One demo is retained per identity. Repeated creation calls do not duplicate the match or reset payment edits. Use **Delete match** to remove it after testing. The demo tools only appear with the explicit `payment-demo` query parameter; normal homepage use never inserts test data. The current cloud machine cannot reach Supabase through its network policy, so the live fixture must be created via that browser entry after the migration; local mocked fixtures and embedded PostgreSQL checks are not evidence of insertion into the hosted project.

## Updating existing payment-enabled projects: pre-match status

Run `supabase/migrations/20261030_pre_match_payments.sql` after the original payment migration. It keeps host-only permissions and allows recording paid/unpaid before the game ends. It does not change existing payment values. New installs already include this in `schema.sql`.

Merkur lists use the heading **Players** with **Player / Status** columns. Every new and pre-migration entry defaults to **Unconfirmed**. They have no fee panel, amount column, or payment editor; registration remains free. Cosmo keeps its existing pricing and live shares.

## Updating existing projects: Merkur confirmation status

Run `supabase/migrations/20261030_merkur_confirmation.sql` in the Supabase SQL Editor. It is safe to rerun and preserves registrations. Existing and new entries default to `confirmed = false` (**Unconfirmed**). Confirmation is independent of Cosmo's `paid` state.

Merkur player rows display plain **Confirmed / Unconfirmed** status text. **Edit confirmation status** opens a separate editor: hosts can choose any player, while participants and registrants can choose only their own primary entry or extra entries they submitted (`user_id` / `added_by`). The database repeats these checks, verifies the player belongs to the selected Merkur match, and records the last updater/time. Cancelled matches cannot be updated. An unrelated browser identity or a matching typed name does not grant access. Cosmo payment permissions and calculations are unchanged.

## Default confirmation for new registrations

Run `supabase/migrations/20261030_confirmed_default.sql` after the Merkur confirmation migration. New registrations now default to **Confirmed**. Existing records, including manually set **Unconfirmed** states, are preserved. Host and registrant editing permissions are unchanged.

## Optional Admin mode

Apply `supabase/migrations/20261030_admin.sql` in the Supabase SQL Editor **after the earlier feature migrations**. This optional migration is intentionally separate from `schema.sql`: it enables the shared-password admin capability requested for this site. It stores a bcrypt hash in a private, RLS-enabled schema. The initial configured password is the one supplied during setup; neither that plaintext password nor an admin token is bundled in the browser assets. Rerunning the migration preserves existing credential settings and sessions.

Click **Admin**, enter the password, and click **Unlock Admin**. Admin mode can create, edit, cancel, restore and delete any match (including historical/cancelled matches), manage every player's name and registration, and change payment/confirmation values. It does not expose Supabase Auth accounts, database credentials, arbitrary SQL, or private admin tables. Match ownership and venue validity constraints remain intact; cancelled records can be restored through the **Cancelled** checkbox in **Edit match**. Destructive deletions retain confirmation prompts.

Every elevated mutation uses the restricted `admin_mutate` RPC with a cryptographically random token. Server-side sessions are bound to the current anonymous browser identity, expire after one hour, and are revoked by **Exit Admin**. Browser tokens are held only in memory, so a page reload also ends local admin mode. Failed password attempts persist: at most five attempts per identity and forty across the site per fifteen-minute window. The server stores only token hashes and a private action audit trail. Ordinary host/registrant permissions are unchanged. Anyone who knows the shared password can administer the site's match/player data.

To rotate the password, use the SQL Editor to set `kickoff_private.admin_config.password_hash` with `extensions.crypt(<new password>, extensions.gen_salt('bf',10))`, then delete rows from `kickoff_private.admin_sessions` to revoke existing sessions. Enter new passwords securely in the SQL Editor; do not place them in browser source or repository files. The migration assumes the standard Supabase `pgcrypto` extension in the `extensions` schema.

## Historical attendance ranking

**Attendance ranking** shows each player's historical appearance count and rank. It counts non-cancelled matches only after their actual 90/120-minute end. Cosmo uses the final registered roster regardless of payment status; Merkur counts only confirmed entries. This is a roster-based count, not independent proof of physical attendance. Test fixtures whose titles start with `TEST ·` are excluded.

Names are normalized for letter case, surrounding/repeated whitespace, and Unicode width. The same name counts once per match, including duplicate registrations; distinct people with the same normalized name are combined. Tied counts share rank. Removing a historical registration/match or changing a Merkur confirmation updates the ranking. History is fetched in pages to avoid the default single-response row limit. No new SQL or permissions are required.

## Admin: transfer host

After Admin setup, run `supabase/migrations/20261031_transfer_host.sql` in the Supabase SQL Editor (safe to rerun). In Admin mode, choose **Transfer host**, select a registered player, and confirm. The server validates the admin session and that the selected player belongs to this match. It atomically changes `matches.owner_id` and records the transfer in the private audit log. Ordinary hosts cannot transfer ownership.

Only primary player entries with a real `user_id` are eligible. A host-added name with no linked browser identity cannot receive login permissions; that person must first join using their own browser. No permissions are silently given to the person who typed a guest's name.

The current host appears at position 1 in every roster, followed by the other entries in stable signup order. A transfer preserves player IDs, registration timestamps, statuses, attendance totals, and existing cent-rounded cost allocations. The old host loses match-wide permissions but retains normal rights to their own registration and any players they added. Admin transfer is also available for historical/cancelled records; the normal restrictions on editing those records remain unchanged.

## Cosmo pitch booking status

Apply `supabase/migrations/20261102_cosmo_booking.sql` to existing projects. New installations include it in `schema.sql`. If Admin mode is installed, also apply `supabase/migrations/20261102_admin_cosmo_booking.sql` after the booking and Admin migrations. Both migrations are transactional and safe to rerun.

Every Cosmo card, including historical and cancelled records, displays **Pitch booking: Booked / Not booked**. Existing and new matches default to **Not booked**. The host or an authenticated Admin can use **Edit booking status** to update this manual record; other visitors can only read it. Database functions enforce ownership/Admin session and Cosmo venue independently of the UI. The optional Admin function records changes in the private audit trail. No booking status appears for Merkur. This does not reserve or cancel a pitch, change match cancellation, attendance, or payment status. Arrange venue changes separately.

## Booking-aware Cosmo payments

Apply `supabase/migrations/20261102_payment_due.sql` after the booking migration. It is transactional and safe to rerun; no separate Admin migration is needed. Existing unpaid members of upcoming, uncancelled, unbooked Cosmo matches become **Not due yet**. Existing **Paid**, booked, historical and Merkur records are preserved.

New registrations (including extra guests and Admin additions) automatically use the current booking state: **Not due yet** before booking, **Unpaid** after booking. Marking the pitch **Booked** changes all Not due yet entries to Unpaid; Paid entries stay Paid. Reverting to Not booked changes unpaid entries back to Not due yet. Existing host/Admin payment permissions are unchanged. The editor's unpaid option reads Not due yet while no payment is due; hosts can still record or undo a payment. Database triggers cover both host and Admin booking paths. Manual paid flags and payment audit timestamps are preserved during automatic booking transitions. No payment is collected.

## Cosmo pitch number

Apply `supabase/migrations/20261104_cosmo_pitch.sql` after the booking migration; new installs include it in `schema.sql`. If Admin mode is installed, also apply `supabase/migrations/20261104_admin_cosmo_pitch.sql`. Both are transactional and safe to rerun.

Once a Cosmo match is Booked, the host can use **Select pitch / Edit pitch** to choose **Soccer 1–6** or clear the assignment. Everyone sees the selected pitch beside Booked. Admins can also edit using their validated session. Database functions independently enforce ownership/session, venue, booked status and the 1–6 range. Reverting to Not booked or changing venue clears the assignment. Existing bookings remain unassigned until a host chooses; no external reservation is made.

## Automatically record the host as Paid on booking

Apply `supabase/migrations/20261104_booked_host_paid.sql` after the booking-aware payment migration. It only replaces the existing trigger function; it does not update current matches or player records. New installs include it in `schema.sql`.

When a Cosmo match changes from Not booked to Booked, its current host's primary registration (`players.user_id = matches.owner_id`) automatically becomes Paid. Both host and Admin booking operations are covered, while other members follow the usual Not due yet → Unpaid transition and existing Paid entries are preserved. The updater identity and time are recorded only when the host was not already Paid. Re-saving an already Booked match does not override a manual payment edit. Undoing booking does not undo Paid. If the host has no registration, no player is created or guest reassigned. This is a manual scheduling convention, not confirmation from a payment processor.

## Automatic cancellation at kick-off

Apply `supabase/migrations/20261106_auto_cancel_underfilled.sql`, then `supabase/migrations/20261106_auto_cancel_schedule.sql` as the database owner. The second migration requires Supabase Cron (`pg_cron`); enable Cron in Supabase if unavailable, then retry. New installations include the worker in `schema.sql` but still need the scheduling migration. Both migrations are safe to rerun and leave unrelated Cron jobs intact.

For both venues, a database Cron worker runs every minute, checks a match once at/after kick-off, and cancels it if fewer than **10 total player entries** are registered. The host and guest entries count; Merkur Unconfirmed entries also count, and Cosmo payment status is irrelevant. Exactly 10 is sufficient. Actual execution can occur up to about a minute after kick-off under normal scheduling; delayed or failed Cron runs delay cancellation. The site does not need to be open. The worker records the check time and count, and cards explain automatic cancellation. The schedule uses `starts_at` (Europe/Berlin converted to an instant), including DST.

Installation enrolls only upcoming, uncancelled matches and does not cancel history. New future matches are enrolled automatically. Each match is checked once: subsequent historical player edits do not trigger another cancellation. Rescheduling into the future enrolls a new check and clears old check metadata. Admin restoration of an already-started match is respected; restoration of a future match schedules its check. Registrations and the worker serialize on the match row, with locked matches retried on later runs. Browser roles cannot invoke the worker or directly update match status.

This only cancels the match on this site. It does **not** cancel a Cosmo venue reservation, issue vouchers, refund payments or send messages. Existing Booked, pitch and Paid records are preserved.

Verify the named `kickoff-cancel-underfilled` job is active in `cron.job` and check its `cron.job_run_details` for successful runs using the queries in the scheduling migration. Applying only the worker SQL does not enable background execution.

## Prevent duplicate names within a match

Apply `supabase/migrations/20261110_duplicate_registration_names.sql` in the Supabase SQL Editor. It is safe to rerun, preserves all existing records (including old duplicates), and is included in `schema.sql` for new installations.

Joining or adding someone else with an already registered name in the same match shows **This name is already registered.** and creates no entry. Matching ignores case, surrounding/repeated whitespace and Unicode width (NFKC). Different matches can use the same name. Rename operations cannot introduce duplicates; unchanged existing names remain editable, and payment/confirmation changes do not affect the check. Use a distinct identifying name for different people with the same name. Names grant no management permissions.

The page checks its loaded roster for immediate feedback. A database trigger also validates self-joins, guest entries, host edits and Admin operations, locking the match row to serialize concurrent registrations. The non-unique lookup index permits legacy duplicates; it is not a cleanup or merge. Install the SQL to enforce the check across browsers and stale pages.
