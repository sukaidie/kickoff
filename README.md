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
