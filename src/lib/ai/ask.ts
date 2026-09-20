import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { claude, MODEL } from "./client";

/* Ask your freight. One search box, answered from the carrier's own loads
   and reply threads, with a citation on every claim. Claude runs a small
   tool loop: it may query loads and replies, then answers in plain words
   citing load ids. No chat history, no memory - one question, one answer. */

const tools: Anthropic.Tool[] = [
  {
    name: "query_loads",
    description: "Search this carrier's own loads (parsed rate confirmations). Returns up to 60 rows, newest first, with an id to cite. All filters optional and combined with AND.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        text: { type: ["string", "null"], description: "free text matched against broker, shipper, facility names, commodity" },
        broker: { type: ["string", "null"] },
        origin_city: { type: ["string", "null"] },
        dest_city: { type: ["string", "null"] },
        state: { type: ["string", "null"], description: "origin or destination state, two letters" },
        family: { type: ["string", "null"], description: "frozen|refrigerated|produce|beverage|dry|other" },
        equipment: { type: ["string", "null"], description: "reefer|dry_van|flatbed" },
        from: { type: ["string", "null"], description: "ISO date, inclusive" },
        to: { type: ["string", "null"], description: "ISO date, inclusive" },
      },
      required: ["text", "broker", "origin_city", "dest_city", "state", "family", "equipment", "from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "query_replies",
    description: "Search replies shippers sent to this carrier's outreach. Returns facility, contact, date, label, and the reply text.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { text: { type: ["string", "null"] } },
      required: ["text"],
      additionalProperties: false,
    },
  },
];

type LoadRow = { id: string; date: string; broker: string | null; shipper: string | null; origin: string; dest: string; family: string | null; equipment: string | null; miles: number | null; rate: number | null; perMile: number | null; commodity: string | null };

async function runQueryLoads(accountId: string, a: Record<string, string | null>): Promise<LoadRow[]> {
  const db = await getDb();
  const L = schema.loads;
  const conds = [eq(L.accountId, accountId)];
  if (a.broker) conds.push(ilike(L.broker, `%${a.broker}%`));
  if (a.origin_city) conds.push(ilike(L.originCity, `%${a.origin_city}%`));
  if (a.dest_city) conds.push(ilike(L.destCity, `%${a.dest_city}%`));
  if (a.state) conds.push(or(eq(L.originState, a.state.toUpperCase()), eq(L.destState, a.state.toUpperCase()))!);
  if (a.family) conds.push(eq(L.family, a.family));
  if (a.equipment) conds.push(eq(L.equipment, a.equipment));
  if (a.from) conds.push(gte(L.pickupAt, new Date(a.from)));
  if (a.to) conds.push(lte(L.pickupAt, new Date(a.to + "T23:59:59Z")));
  if (a.text) {
    const t = `%${a.text}%`;
    conds.push(or(ilike(L.broker, t), ilike(L.shipper, t), ilike(L.commodity, t), ilike(L.originCity, t), ilike(L.destCity, t),
      sql`exists (select 1 from ${schema.facilities} f where (f.id = ${L.originId} or f.id = ${L.destId}) and f.name ilike ${t})`)!);
  }
  const rows = await db.select().from(L).where(and(...conds)).orderBy(desc(L.pickupAt)).limit(60);
  return rows.map((r) => ({
    id: r.id, date: r.pickupAt ? r.pickupAt.toISOString().slice(0, 10) : "", broker: r.broker, shipper: r.shipper,
    origin: `${r.originCity ?? "?"}, ${r.originState ?? "?"}`, dest: `${r.destCity ?? "?"}, ${r.destState ?? "?"}`,
    family: r.family, equipment: r.equipment, miles: r.miles, rate: r.rate, perMile: r.perMile, commodity: r.commodity,
  }));
}

async function runQueryReplies(accountId: string, text: string | null) {
  const db = await getDb();
  const S = schema.sequences;
  const conds = [eq(S.accountId, accountId), sql`${S.replyText} is not null`];
  if (text) conds.push(ilike(S.replyText, `%${text}%`));
  const rows = await db.select({ id: S.id, facilityId: S.facilityId, label: S.replyLabel, text: S.replyText, at: S.replyAt, contactId: S.contactId })
    .from(S).where(and(...conds)).orderBy(desc(S.replyAt)).limit(30);
  const out = [];
  for (const r of rows) {
    const [f] = await db.select({ name: schema.facilities.name }).from(schema.facilities).where(eq(schema.facilities.id, r.facilityId));
    const [c] = r.contactId ? await db.select({ name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.id, r.contactId)) : [];
    out.push({ id: r.id, facility: f?.name, contact: c?.name, date: r.at?.toISOString().slice(0, 10), label: r.label, text: r.text });
  }
  return out;
}

export type Citation = { kind: "load"; id: string; label: string } | { kind: "reply"; id: string; label: string };

export async function askFreight(accountId: string, question: string, company: string) {
  const today = new Date().toISOString().slice(0, 10);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const seenLoads = new Map<string, LoadRow>();
  const seenReplies = new Map<string, { facility?: string; date?: string }>();
  let answer = "";

  for (let turn = 0; turn < 5; turn++) {
    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: `You answer questions for the dispatcher at ${company}, a trucking company, using only their own loads and reply threads through the tools. Today is ${today}. "Last winter" means the most recent Dec-Feb. Always query before answering; run more than one query when the question compares periods or brokers. Answer in two to four plain sentences with the specific names, counts, dates and rates you found. When you state a fact, cite the rows it rests on by writing [load:ID] or [reply:ID] right after it, using the ids the tools returned. Compare rate per mile, not totals. If the data does not answer the question, say exactly that; never guess.`,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "tool_use") {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as Record<string, string | null>;
        let content: string;
        try {
          if (block.name === "query_loads") {
            const rows = await runQueryLoads(accountId, input);
            rows.forEach((r) => seenLoads.set(r.id, r));
            content = JSON.stringify(rows);
          } else {
            const rows = await runQueryReplies(accountId, input.text);
            rows.forEach((r) => seenReplies.set(r.id, r));
            content = JSON.stringify(rows);
          }
        } catch (e) { content = `error: ${(e as Error).message}`; }
        results.push({ type: "tool_result", tool_use_id: block.id, content });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    answer = res.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
    break;
  }

  /* Resolve citations to rows the model actually saw; drop any it made up. */
  const citations: Citation[] = [];
  const clean = answer.replace(/\[(load|reply):([a-zA-Z0-9-]+)\]/g, (_m, kind, id) => {
    if (kind === "load" && seenLoads.has(id)) {
      const r = seenLoads.get(id)!;
      if (!citations.find((c) => c.id === id)) citations.push({ kind: "load", id, label: `${r.date} · ${r.origin} → ${r.dest} · ${r.broker ?? "?"} · ${r.perMile ? "$" + r.perMile.toFixed(2) + "/mi" : ""}` });
      return "";
    }
    if (kind === "reply" && seenReplies.has(id)) {
      const r = seenReplies.get(id)!;
      if (!citations.find((c) => c.id === id)) citations.push({ kind: "reply", id, label: `${r.date ?? ""} · ${r.facility ?? ""}` });
      return "";
    }
    return "";
  }).replace(/\s+([.,;])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

  return { answer: clean || "I could not find anything in your loads that answers that.", citations };
}
