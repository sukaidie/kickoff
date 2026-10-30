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

Without Supabase settings the site displays an explicit setup notice. It does not silently store local matches or pretend data is shared.

## Required Supabase setup

1. Create a Supabase project. Run `supabase/schema.sql` **once** in its SQL editor. This creates the schema, row-level security, restricted write functions, and Realtime publication membership. The migration is transactional, not designed to be rerun over existing tables.
2. Enable **Anonymous Sign-Ins** under Authentication → Sign In / Providers. Visitors get an anonymous identity automatically; no email, password, or registration UI is needed. Configure the production site URL as `https://sukaidie.github.io/kickoff/`.
3. Set `VITE_SUPABASE_URL` to the project's HTTPS URL and `VITE_SUPABASE_ANON_KEY` to its **public publishable or legacy anon key**. Never use a service-role/secret key. For local development put these in ignored `.env.local`.
4. In GitHub repository Settings → Secrets and variables → Actions → **Variables**, add the same two names. These are deliberately public browser configuration. Rerun the Pages workflow after setting or changing them.
5. Validate with two browsers: create a future match, join from the other browser, verify both lists and cost shares update, verify only the organiser can cancel, then verify joining the cancelled match fails. Realtime updates have a ten-second polling fallback.

**Current setup:** no Supabase project URL or public key was supplied. Hosted Supabase Auth, Realtime, and shared persistence therefore remain unverified. The SQL migration and access-control operations are tested against embedded PostgreSQL with a simulated `auth.uid()` and Supabase roles; this does not substitute for the hosted integration check.

### Access and privacy

Authenticated anonymous visitors can read the schedule and public player names. All direct table writes are denied. Security-definer functions require `auth.uid()`, derive ownership from that identity, enforce one player per identity per match, validate names/venues/times, reject past or cancelled games, and permit cancellation only by the organiser. Match creation is atomic with the organiser's entry. Join/leave operations lock the match row to serialize with cancellation. Creation is limited to 20 matches per identity per day.

Anonymous access is intentionally open, not identity verification. Clearing browser storage loses control of that identity's entries and created matches. New identities can bypass per-identity limits; monitor Supabase abuse and configure Auth rate limits before a broad launch. Names are public, so avoid sensitive information. Payments are amounts due, not payment collection or verified payment status.

## Rules

- Venues: Cosmo and Merkur Spiel-Arena. No Merkur rate was supplied, so its total and player costs are **TBC**.
- 0–15 players: 90 minutes. 16+ players: 120 minutes. Leaving can reduce duration again.
- Cosmo: weekdays 10:00–14:00 €40/h, 14:00–17:00 €64/h, 17:00–22:00 €80/h. Weekends and all NRW statewide public holidays: €76/h. Minute-by-minute calculation splits a booking across rate bands.
- NRW holidays include New Year, Good Friday, Easter Monday, Labour Day, Ascension, Whit Monday, Corpus Christi, German Unity Day, All Saints, and both Christmas holidays.
- New Cosmo kick-offs must be between 10:00 and 20:00 to accommodate an automatic two-hour game before 22:00. Dates are interpreted in Europe/Berlin, independently of the visitor's timezone.
- Cost shares sum exactly to the total, with any extra cents assigned by stable join order. The headline displays the maximum individual share when rounding differs.
- Cancellation: more than 48 hours → 100% voucher; 24 through 48 hours inclusive → 50%; less than 24 hours → none. Exactly 48 hours is treated as the 50% band. Estimates refer to the match total. Venue bookings, cancellation requests, voucher issuance, and payments happen outside this site.

## GitHub Pages

The `.github/workflows/pages.yml` workflow installs from the lockfile, tests, builds with `/kickoff/` as its base, and deploys the `dist` artifact on pushes to `main` or manual dispatch.

Enable GitHub Pages in repository Settings → Pages, with **GitHub Actions** as the source. The workflow needs Pages write and OIDC permissions, and the default `github-pages` environment must permit `main`. GitHub API access may be separately restricted even when Git push works. Until a successful Pages workflow and HTTP request are verified, the expected URL `https://sukaidie.github.io/kickoff/` should not be assumed live.
