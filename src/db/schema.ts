import {
  pgTable, text, integer, timestamp, boolean, jsonb, doublePrecision, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------- accounts & users ---------- */
export const accounts = pgTable("accounts", {
  id: id(),
  company: text("company").notNull(),
  mc: text("mc"),
  plan: text("plan").notNull().default("free"),            // free | carrier | fleet
  tokensMonthly: integer("tokens_monthly").notNull().default(20),
  tokensExtra: integer("tokens_extra").notNull().default(0),
  dailyCap: integer("daily_cap").notNull().default(25),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  forwardToken: text("forward_token").notNull().$defaultFn(() => crypto.randomUUID().slice(0, 8)),
  createdAt: now(),
});

export const users = pgTable("users", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: now(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

/* ---------- mail sources ---------- */
export const mailboxes = pgTable("mailboxes", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                 // gmail_imap | microsoft | forward | upload
  address: text("address").notNull(),
  secret: text("secret"),                       // encrypted: app password, or OAuth refresh token
  lastUid: integer("last_uid").notNull().default(0),
  queued: integer("queued").notNull().default(0),        // messages still to read after the last pass
  readCount: integer("read_count").notNull().default(0), // loads stored from this mailbox
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  historyDone: boolean("history_done").notNull().default(false),
  status: text("status").notNull().default("ok"),
  error: text("error"),
  createdAt: now(),
});

/* ---------- freight ---------- */
export const facilities = pgTable("facilities", {
  id: id(),
  key: text("key").notNull(),                   // normalized street|city|state
  name: text("name").notNull(),
  street: text("street"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip"),
  type: text("type").notNull().default("unknown"),   // 3pl | shipper | dc | unknown
  shipper: text("shipper"),
  domain: text("domain"),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }),   // last free people lookup
  createdAt: now(),
}, (t) => [uniqueIndex("facilities_key_idx").on(t.key)]);

export const loads = pgTable("loads", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  mailboxId: text("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  sourceRef: text("source_ref"),                // message id / file name, dedupe key
  loadNumber: text("load_number"),
  broker: text("broker"),
  brokerMc: text("broker_mc"),
  brokerEmail: text("broker_email"),
  shipper: text("shipper"),
  originId: text("origin_id").references(() => facilities.id),
  destId: text("dest_id").references(() => facilities.id),
  originCity: text("origin_city"),
  originState: text("origin_state"),
  destCity: text("dest_city"),
  destState: text("dest_state"),
  pickupAt: timestamp("pickup_at", { withTimezone: true }),
  deliveryAt: timestamp("delivery_at", { withTimezone: true }),
  commodity: text("commodity"),
  family: text("family"),                       // frozen | produce | beverage | dry | other
  equipment: text("equipment"),                 // reefer | dry_van | flatbed | other
  tempF: doublePrecision("temp_f"),
  miles: integer("miles"),
  rate: doublePrecision("rate"),
  perMile: doublePrecision("per_mile"),
  direct: boolean("direct").notNull().default(false),
  confidence: doublePrecision("confidence"),
  raw: jsonb("raw"),
  createdAt: now(),
}, (t) => [
  index("loads_account_idx").on(t.accountId),
  uniqueIndex("loads_source_idx").on(t.accountId, t.sourceRef),
]);

/* Every stop on a load. A multi-stop tender has several pickups and drops;
   each pickup is a shipper observation, each drop is a receiver. */
export const stops = pgTable("stops", {
  id: id(),
  loadId: text("load_id").notNull().references(() => loads.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(),                 // pickup | drop
  facilityId: text("facility_id").references(() => facilities.id),
  city: text("city"),
  state: text("state"),
  at: timestamp("at", { withTimezone: true }),
}, (t) => [index("stops_account_idx").on(t.accountId), index("stops_facility_idx").on(t.facilityId)]);

/* ---------- prospects & contacts ---------- */
export const prospects = pgTable("prospects", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  facilityId: text("facility_id").notNull().references(() => facilities.id),
  kind: text("kind").notNull(),                 // receiver | lookalike
  why: text("why"),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [uniqueIndex("prospects_unique_idx").on(t.accountId, t.facilityId)]);

/* People at a dock. Shared across carriers: one discovery serves everyone.
   What each carrier has paid to see is in `reveals`. */
export const contacts = pgTable("contacts", {
  id: id(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),   // legacy, unused
  facilityId: text("facility_id").notNull().references(() => facilities.id),
  name: text("name"),
  title: text("title"),
  linkedin: text("linkedin"),
  email: text("email"),
  emailStatus: text("email_status"),            // verified | bounced
  phone: text("phone"),
  source: jsonb("source"),                      // which provider found which field
  createdAt: now(),
}, (t) => [index("contacts_facility_idx").on(t.facilityId)]);

export const reveals = pgTable("reveals", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  field: text("field").notNull(),               // name | linkedin | email | phone
  createdAt: now(),
}, (t) => [uniqueIndex("reveals_unique_idx").on(t.accountId, t.contactId, t.field)]);

/* ---------- outreach ---------- */
export const sequences = pgTable("sequences", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  facilityId: text("facility_id").notNull().references(() => facilities.id),
  status: text("status").notNull().default("draft"),   // draft | active | replied | paused | done
  step: integer("step").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }),
  threadId: text("thread_id"),                  // first Message-ID, for reply matching
  replyLabel: text("reply_label"),
  replyText: text("reply_text"),
  replyAt: timestamp("reply_at", { withTimezone: true }),
  suggested: text("suggested"),
  createdAt: now(),
});

export const touches = pgTable("touches", {
  id: id(),
  sequenceId: text("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  step: integer("step").notNull(),
  channel: text("channel").notNull(),           // email | linkedin
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),   // draft | approved | sent | copied | skipped
  messageId: text("message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: now(),
});

/* ---------- tokens ---------- */
export const ledger = pgTable("ledger", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  what: text("what").notNull(),
  ref: text("ref"),
  createdAt: now(),
}, (t) => [index("ledger_account_idx").on(t.accountId)]);

export const questions = pgTable("questions", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  q: text("q").notNull(),
  answer: text("answer"),
  citations: jsonb("citations"),
  createdAt: now(),
});

export const _sql = sql;
