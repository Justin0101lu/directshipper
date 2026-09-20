# Direct Shipper

Connect a carrier's inbox. Read every rate confirmation in it. Show them what they really haul, which docks they already deliver to that ship outbound, which shippers in the network look like their freight, and run the outreach. One search box answers questions about their own loads with the rate con cited.

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
3. **Stripe.** Create two recurring prices, $39/mo and $149/mo. Put their ids in `STRIPE_PRICE_CARRIER` and `STRIPE_PRICE_FLEET`. Add a webhook to `https://<your domain>/api/stripe/webhook` for `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`; put its secret in `STRIPE_WEBHOOK_SECRET`.
4. **Contacts.** Any of `FINDYMAIL_API_KEY`, `PEOPLEDATALABS_API_KEY`, `LEADMAGIC_API_KEY`, `PROSPEO_API_KEY`, `WIZA_API_KEY`. People Data Labs is the one that finds *who* the transportation contact is; the others find emails and phones. Start with Findymail plus People Data Labs.
5. **Forwarding address.** Point a Postmark inbound stream (or any provider posting Postmark-shaped JSON) at `https://<your domain>/api/inbound/<INBOUND_SECRET>` and set `INBOUND_DOMAIN` to the domain you receive on. Each account gets `loads-<token>@<INBOUND_DOMAIN>`.
6. **Outlook (optional).** Register an app in Entra, redirect URI `https://<your domain>/api/mail/microsoft/callback`, delegated permissions `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`. Set `MS_CLIENT_ID` / `MS_CLIENT_SECRET`. Leave empty and the Outlook button is hidden.
7. **Cron.** `vercel.json` runs `/api/cron` every 10 minutes: reads new mail, sends due follow-ups, checks for replies. Set `CRON_SECRET`; Vercel sends it as a bearer token. Anywhere else, run `npm run cron` from a system cron.
8. `APP_URL` and a long random `APP_SECRET`. The secret signs sessions and encrypts mailbox credentials at rest; changing it logs everyone out and invalidates stored app passwords.

Push the folder to Vercel with the root set to `directshipper/`. Done.

## How Gmail works without Google's review

Google's OAuth for reading mail needs a restricted-scope review and a paid third-party security audit. Direct Shipper avoids it: the carrier turns on 2-Step Verification, creates an **App Password** at `myaccount.google.com/apppasswords`, and pastes it in. The app reads over IMAP (`imap.gmail.com:993`) and sends over SMTP as them. Works for personal Gmail and Google Workspace. The password is encrypted with `APP_SECRET` and never leaves the server. Gmail's own sending cap applies (roughly 500 a day per account, which is far above what a carrier sends).

Outlook removed password sign-in for IMAP, so Outlook uses Microsoft's OAuth, which is free and needs no paid audit.

## What happens after a mailbox connects

1. `src/lib/mail/imap.ts` walks the mailbox oldest-first in batches of 60 to 150, matching subjects and bodies that look like rate cons (`filter.ts`), so a years-deep history fills in over an hour or two of cron ticks instead of one long request.
2. `src/lib/ai/parse.ts` reads each PDF or email body into a structured load with Claude (structured output, one document per call).
3. `src/lib/freight/store.ts` resolves the pickup and delivery to facilities by normalized street address (`facilities.ts`), so the same dock spelled three ways becomes one record.
4. `profile.ts` computes the freight profile; `prospects.ts` computes receivers (the carrier's own consignees) and lookalikes (network origins with the same freight family and equipment the carrier has never touched); `network.ts` publishes a dock's outbound figures only once **three or more unrelated accounts** have seen it (`NETWORK_K`).
5. `src/lib/enrich` is the token waterfall: one token per verified field, refunded on a miss or a bounce, first provider with a hit wins.
6. `src/lib/outreach` drafts seven touches with Claude, sends the opener only after the carrier approves it, sends email follow-ups on schedule, marks LinkedIn steps copy-only, and stops on the first reply, which Claude labels and answers with a suggested reply for approval.
7. `src/lib/ai/ask.ts` answers a question by querying the carrier's own loads and replies through tools and citing the row ids it used. Citations the model did not actually retrieve are dropped.

## Tokens and plans

Free: 20 to start, 10 a month. Carrier $39: 100 a month, outreach sends, export, extra tokens 50c. Fleet $149: 500 a month, extra 40c. Everything about the carrier's own freight is free. Monthly tokens are spent before purchased ones. A daily cap (default 25) stops runaway searches. All of it lives in `src/lib/tokens.ts` and `src/lib/plans.ts`.

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
