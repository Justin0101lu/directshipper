# Direct Shipper

Connect a carrier's inbox. Read every rate confirmation in it. Show them what they really haul, which warehouses they already deliver to that ship outbound, which shippers in the network look like their freight, and run the outreach. One search box answers questions about their own loads with the rate con cited.

Three tabs: **Prospects**, **Outreach**, **My freight**. Settings under the account menu. No CRM.

## Run it locally in two minutes

```bash
cd directshipper
npm install
cp .env.example .env          # set APP_SECRET and ANTHROPIC_API_KEY at minimum
npm run demo                  # seeds a demo carrier + network carriers into the embedded database
npm run dev                   # http://localhost:3000  ->  demo@directshipper.co / demo1234
```

With no `DATABASE_URL` the app runs on an embedded Postgres (PGlite) under `.data/`. That is for your laptop only.

## Deploy (Vercel + Neon, about 20 minutes, no code)

1. **Database.** Create a free Postgres on Neon or Supabase. Copy the connection string into `DATABASE_URL`. Migrations run on first request.
2. **Anthropic.** `ANTHROPIC_API_KEY` from console.anthropic.com. Two models: `PARSE_MODEL` (default `claude-haiku-4-5`) reads rate cons as extracted text at about a fifth of a cent each, so a 2,000-load inbox is roughly $4; `CLAUDE_MODEL` (default `claude-opus-5`) does the low-volume work: drafting, reply triage, the question box. Only a scanned PDF with no text layer is sent as an image.
3. **Stripe.** Create three recurring prices, $99/mo, $299/mo and $799/mo. Put their ids in `STRIPE_PRICE_CARRIER`, `STRIPE_PRICE_FLEET` and `STRIPE_PRICE_ENTERPRISE` (leave Enterprise blank to show "Talk to us" instead). Add a webhook to `https://<your domain>/api/stripe/webhook` for `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`; put its secret in `STRIPE_WEBHOOK_SECRET`.
4. **Contacts.** Any of `FINDYMAIL_API_KEY`, `PEOPLEDATALABS_API_KEY`, `LEADMAGIC_API_KEY`, `PROSPEO_API_KEY`, `WIZA_API_KEY`. People Data Labs is the one that finds *who* the transportation contact is; the others find emails and phones. Start with Findymail plus People Data Labs.
5. **Forwarding address.** Point a Postmark inbound stream (or any provider posting Postmark-shaped JSON) at `https://<your domain>/api/inbound/<INBOUND_SECRET>` and set `INBOUND_DOMAIN` to the domain you receive on. Each account gets `loads-<token>@<INBOUND_DOMAIN>`.
6. **Outlook (optional).** Register an app in Entra, redirect URI `https://<your domain>/api/mail/microsoft/callback`, delegated permissions `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`. Set `MS_CLIENT_ID` / `MS_CLIENT_SECRET`. Leave empty and the Outlook button is hidden.
7. **Cron.** `vercel.json` runs `/api/cron` every 10 minutes: reads new mail, queues due follow-ups, checks for replies, and runs the paced sender once. Off Vercel the built-in scheduler also runs the sender every minute, which is what keeps the 3 to 8 minute gap between emails. On Vercel, point a second cron at `/api/cron` every minute if you want the same pacing. Set `CRON_SECRET`; Vercel sends it as a bearer token. Anywhere else, run `npm run cron` from a system cron.
8. `APP_URL` and a long random `APP_SECRET`. The secret signs sessions and encrypts mailbox credentials at rest; changing it logs everyone out and invalidates stored app passwords.

Push the folder to Vercel with the root set to `directshipper/`. Done.

## How Gmail works without Google's review

Google's OAuth for reading mail needs a restricted-scope review and a paid third-party security audit. Direct Shipper avoids it: the carrier turns on 2-Step Verification, creates an **App Password** at `myaccount.google.com/apppasswords`, and pastes it in. The app reads over IMAP (`imap.gmail.com:993`) and sends over SMTP as them. Works for personal Gmail and Google Workspace. The password is encrypted with `APP_SECRET` and never leaves the server. Gmail's own sending cap applies (roughly 500 a day per account, which is far above what a carrier sends).

Outlook removed password sign-in for IMAP, so Outlook uses Microsoft's OAuth, which is free and needs no paid audit.

## What happens after a mailbox connects

1. `src/lib/mail/imap.ts` walks the mailbox oldest-first in batches of 60 to 150, matching subjects and bodies that look like rate cons (`filter.ts`), so a years-deep history fills in over an hour or two of cron ticks instead of one long request.
2. `src/lib/ai/parse.ts` reads each PDF or email body into a structured load with Claude (structured output, one document per call).
3. `src/lib/freight/store.ts` resolves the pickup and delivery to facilities by normalized street address (`facilities.ts`), so the same warehouse spelled three ways becomes one record.
4. `profile.ts` computes the freight profile; `prospects.ts` computes receivers (the carrier's own consignees) and lookalikes (network origins with the same freight family and equipment the carrier has never touched); `network.ts` publishes a warehouse's outbound figures only once **three or more unrelated accounts** have seen it (`NETWORK_K`).
5. `src/lib/enrich` looks for two kinds of people at each company: head office (transportation, logistics, procurement; found once per company and shared across its warehouses through `facilities.company_key`) and site (warehouse and shipping titles in that state). `bestPerson` prefers head office. It is also the token waterfall: one token per verified field, refunded on a miss or a bounce, first provider with a hit wins.
6. `src/lib/outreach` is a ranked list of warehouses from the carrier's own rate cons. `freight/relationship.ts` summarizes the history with each warehouse (deliveries, pickups, first and last date, weekday, inbound lanes, broker count) for free; the sequence is written from that summary, addressed to `{{first}}`, before any person is known, so the cron pre-writes the warmest warehouses as the scan fills in. Warehouses the carrier only picks up from through an active broker are excluded. Each card has one next step: find contacts (free), reveal the best-titled person's email (a token), approve the opener. Follow-ups send themselves, the one call step lands on the carrier's list with a script and a voicemail line (outcome logged: spoke pauses the emails, wrong number clears the phone), and a reply stops everything and gets a suggested answer. When the reply asks for a rate on a lane, `freight/quote.ts` answers from the carrier's own rate cons (city pair, then state pair, never invented) and the suggested reply states it, with the basis shown to the carrier.
7. `src/lib/ai/ask.ts` answers a question by querying the carrier's own loads and replies through tools and citing the row ids it used. Citations the model did not actually retrieve are dropped.

## Cold prospects

Lookalikes need three unrelated carriers to have seen a warehouse, so a young network shows nothing. Until it fills in, the Lookalikes tab pulls companies in the carrier's kind of freight and state from People Data Labs' company search (`/api/prospects/companies`, 20 at a time, one token each, charged only for what comes back), stored as facilities of type `company` and marked COLD. The landing page does not sell lookalikes.

## Sending limits

Every approved opener and due follow-up is queued, not sent. `sendQueued` in `src/lib/outreach` sends one email per mailbox at a time, waits a random gap (3 to 8 minutes by default) before the next from that mailbox, and stops at the daily count (20 by default). The call step is the carrier's to make; at most 10 a day (setting, capped at 40) are put on the list. All of it is per account under Settings → Sources, capped at 50 emails a day. Limits apply to each mailbox; more volume means more mailboxes.

## Tokens and plans

A flat fee with tokens included, then packs at the plan's rate. Free: 10 welcome tokens, no monthly bundle, packs at 50c. Carrier $99: 200 included, packs at 40c, autopilot may send, 1 sending inbox, 3 new shippers a day. Fleet $299: 600 included, 30c, 5 inboxes, 10 a day. Enterprise from $799: 2,000 included, 25c. Included tokens are spent first and reset on the billing date (a reset, not a top-up); purchased tokens never expire. A refund goes back to the pool it came from. Every ledger row carries its dollar value. Auto top-up (opt in) buys the 50-token pack on the saved card when the balance drops under 10, at most once a day. Who someone is (name, title, LinkedIn) is 1 token, an email 1, a phone 3, a lookalike 1. All of it lives in `src/lib/tokens.ts`, `src/lib/stripe.ts` and `src/lib/plans.ts`.

## Commands

```bash
npm run dev          # local
npm run build        # production build + typecheck
npm test             # unit tests (facility resolution, filter, medians)
npm run db:generate  # after editing src/db/schema.ts
npm run demo         # seed demo data (embedded database or DATABASE_URL)
npm run cron         # run the cron job once by hand
```

## Not built, on purpose

Pipeline stages, notes, quotes, dormant-broker reactivation, a CRM sync, LinkedIn automation, rate prediction, a chatbot. The prototype that this was built from is the spec; anything not on its three tabs is out.

## Legal notes to read before charging

- The non-solicit copy on the landing page and in Prospects is product copy, not legal advice. Have a transportation attorney read it before launch.
- Network outbound figures are aggregated across unrelated carriers with a minimum of three. Keep that minimum; it is what makes "nobody can trace a load back" true.
- "Delete my data" removes the account and everything under it immediately. Facilities are shared, anonymous records and carry nothing that points to a carrier.
