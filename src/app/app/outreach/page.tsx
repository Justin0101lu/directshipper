"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type Person = { id: string; scope?: "hq" | "site"; title: string | null; name: string | null; email: string | null; emailStatus: string | null; phone: string | null; linkedin: string | null; has: Record<string, boolean> };
type Touch = { id: string; step: number; channel: string; subject: string | null; body: string; status: string; sentAt: string | null; outcome?: string | null };
type Seq = { id: string; mailboxId: string | null; status: string; step: number; nextAt: string | null; replyLabel: string | null; replyText: string | null; replyAt: string | null; suggested: string | null; quoteNote?: string | null; contactId: string | null; touches: Touch[] };
type Rel = { deliveries: number; pickups: number; lastAt: string | null; daysSinceLast: number | null; perMonth: number; weekday: string | null; brokers: number; kind: string; warmth: number };
type Hold = { broker: string; lastLoad: string; until: string; expired: boolean; source: string; coversConsignees: boolean; termMonths: number | null; clause?: string };
type Card = { facilityId: string; name: string; city: string; rel: Rel | null; summary: string; sequence: Seq | null; people: Person[]; best: Person | null; contact: Person | null; hold: { clear: boolean; holds: Hold[]; reason: string }; state: string };
type Data = { cards: Card[]; sequence: { day: number; channel: string; name: string; approve: boolean }[] };

const LABEL: Record<string, [string, string]> = { interested: ["INTERESTED", "t-ver"], send_paperwork: ["SEND PAPERWORK", "t-ver"], not_now: ["NOT NOW", "t-inf"], wrong_person: ["WRONG PERSON", "t-inf"], unsubscribe: ["UNSUBSCRIBE", "t-flag"], unclear: ["REPLIED", "t-obs"] };
const STATE: Record<string, [string, string]> = { held: ["ON HOLD", "t-flag"], replied: ["REPLIED", "t-ver"], ready: ["READY TO SEND", "t-ver"], queued: ["SENDING SOON", "t-ver"], copy: ["CALL TODAY", "t-obs"], needs_email: ["NEEDS AN EMAIL", "t-obs"], needs_people: ["NEEDS A CONTACT", "t-obs"], needs_draft: ["NOT DRAFTED YET", "t-inf"], active: ["RUNNING", "t-ver"], paused: ["PAUSED", "t-inf"], done: ["DONE", "t-inf"] };
const FILTERS = [["all", "All"], ["todo", "Needs you"], ["active", "Running"], ["replied", "Replied"], ["held", "On hold"], ["done", "Done"]] as const;

export default function Outreach() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [d, setD] = useState<Data | null>(null); const [open, setOpen] = useState<string | null>(null); const [step, setStep] = useState(0);
  const [edit, setEdit] = useState<{ subject: string; body: string } | null>(null); const [busy, setBusy] = useState<string | null>(null); const [filter, setFilter] = useState<string>("all");
  const load = useCallback(() => api<Data>("/api/outreach").then(setD).catch((e) => flash(e.message, "err")), [flash]);
  useEffect(() => { load(); }, [load]);
  const canSend = me && me.plan !== "free";
  const hasMailbox = me?.mailboxes.some((m) => m.kind === "gmail_imap" || m.kind === "microsoft");

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) flash(ok); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/settings/billing"); }
    finally { setBusy(null); }
  };
  const prepare = (c: Card) => run(`prep:${c.facilityId}`, () => api("/api/outreach/start", { method: "POST", json: { facilityId: c.facilityId } }), "Sequence written from your history with this warehouse.");
  const prepareTop = () => run("prep:top", async () => { const x = await api<{ made: number }>("/api/outreach/prepare", { method: "POST", json: { n: 5 } }); flash(`${x.made} sequence${x.made === 1 ? "" : "s"} written.`); });
  const discover = (c: Card) => run(`disc:${c.facilityId}`, () => api("/api/contacts/discover", { method: "POST", json: { facilityId: c.facilityId } }), "Looked up. Titles are free; an email is one token.");
  const revealEmail = (c: Card, p: Person) => run(`email:${p.id}`, async () => {
    if (!p.name) await api("/api/contacts/reveal", { method: "POST", json: { contactId: p.id, field: "name" } });
    const x = await api<{ found: boolean }>("/api/contacts/reveal", { method: "POST", json: { contactId: p.id, field: "email" } });
    if (!x.found) throw new Error("No verified email found for this person. Nothing charged for the email.");
    if (c.sequence) await api("/api/outreach/attach", { method: "POST", json: { sequenceId: c.sequence.id, contactId: p.id } });
    else await api("/api/outreach/start", { method: "POST", json: { facilityId: c.facilityId, contactId: p.id } });
  }, "Email found and attached. Approve the opener when you are ready.");
  const approve = (c: Card) => run(`send:${c.facilityId}`, () => api("/api/outreach/approve", { method: "POST", json: { sequenceId: c.sequence!.id, subject: edit?.subject, body: edit?.body } }), "Approved. It goes out within minutes, spaced from your other sends to protect your inbox. Follow-ups are scheduled and stop the moment they reply.");
  const sendReply = (c: Card) => run(`reply:${c.facilityId}`, () => api("/api/outreach/reply", { method: "POST", json: { sequenceId: c.sequence!.id, body: edit?.body ?? c.sequence!.suggested } }), "Reply sent as you.");
  const copied = (t: Touch) => run(`copy:${t.id}`, async () => { navigator.clipboard?.writeText(t.body); await api("/api/outreach/copied", { method: "POST", json: { touchId: t.id } }); }, "Copied. The step is marked done.");
  const called = (t: Touch, outcome: string) => run(`call:${t.id}`, () => api("/api/outreach/copied", { method: "POST", json: { touchId: t.id, outcome } }), outcome === "spoke" ? "Logged. The email follow-ups are paused while you two talk; resume any time." : outcome === "wrong_number" ? "Logged and the number cleared. Reveal a new one when you are ready." : "Logged. The email follow-ups carry on as scheduled.");
  const getPhone = (c: Card, p: Person) => run(`phone:${p.id}`, async () => {
    if (!p.name) await api("/api/contacts/reveal", { method: "POST", json: { contactId: p.id, field: "name" } });
    const x = await api<{ found: boolean }>("/api/contacts/reveal", { method: "POST", json: { contactId: p.id, field: "phone" } });
    if (!x.found) throw new Error("No direct phone found for this person. Nothing charged.");
  }, "Phone found. The script is in the panel below.");
  const setSender = (c: Card, mailboxId: string) => run(`sender:${c.facilityId}`, () => api("/api/outreach/sender", { method: "POST", json: { sequenceId: c.sequence!.id, mailboxId } }), "Sender set.");
  const senders = (me?.mailboxes || []).filter((m) => m.kind === "gmail_imap" || m.kind === "microsoft");
  const setAuto = (autopilot: string, autoPerDay?: number) => run("auto", () => api("/api/account/settings", { method: "POST", json: { autopilot, autoPerDay } }), autopilot === "send" ? "Autopilot on. It reaches out to new shippers every day inside your limits; you will see replies here." : autopilot === "draft" ? "Drafting only. Nothing sends until you approve." : "Autopilot off.");
  const pause = (c: Card, on: boolean) => run(`pause:${c.facilityId}`, () => api("/api/outreach/pause", { method: "POST", json: { sequenceId: c.sequence!.id, on } }), on ? "Paused." : "Resumed.");

  const cards = (d?.cards || []).filter((c) => filter === "all" ? c.state !== "done" : filter === "held" ? c.state === "held" : filter === "todo" ? ["replied", "ready", "copy", "needs_email", "needs_people", "needs_draft"].includes(c.state) : filter === "active" ? ["active", "queued", "paused"].includes(c.state) : c.state === filter);
  const counts = (k: string) => (d?.cards || []).filter((c) => k === "all" ? c.state !== "done" : k === "held" ? c.state === "held" : k === "todo" ? ["replied", "ready", "copy", "needs_email", "needs_people", "needs_draft"].includes(c.state) : k === "active" ? ["active", "queued", "paused"].includes(c.state) : c.state === k).length;

  /* The one button each card needs next. */
  function primary(c: Card) {
    const p = c.contact || c.best;
    switch (c.state) {
      case "held": return <a className="btn-ghost" href="/app/settings/agreements">Upload the agreement</a>;
      case "needs_draft": return <button className="btn" disabled={busy === `prep:${c.facilityId}` || !me?.features.ai} onClick={() => prepare(c)}>{busy === `prep:${c.facilityId}` ? <><span className="spin" />Writing…</> : "Write the sequence · free"}</button>;
      case "needs_people": return <button className="btn" disabled={busy === `disc:${c.facilityId}` || !me?.features.providers.includes("peopledatalabs")} onClick={() => discover(c)} title={me?.features.providers.includes("peopledatalabs") ? "" : "Needs a People Data Labs key"}>{busy === `disc:${c.facilityId}` ? <><span className="spin" />Looking…</> : "Find contacts · free"}</button>;
      case "needs_email": return p ? <button className="btn" disabled={busy === `email:${p.id}`} onClick={() => revealEmail(c, p)}>{busy === `email:${p.id}` ? <><span className="spin" />Finding…</> : `Get ${p.name ? p.name.split(" ")[0] + "'s" : "the " + (p.title || "contact") + "'s"} email · ${p.name ? "1" : "2"} tokens`}</button> : null;
      case "ready": return <button className="btn" disabled={busy === `send:${c.facilityId}` || !canSend || !hasMailbox} onClick={() => { setOpen(c.facilityId); setStep(0); approve(c); }}>{busy === `send:${c.facilityId}` ? <><span className="spin" />Sending…</> : "Approve & send opener"}</button>;
      case "replied": return c.sequence?.suggested ? <button className="btn" disabled={busy === `reply:${c.facilityId}` || !canSend} onClick={() => sendReply(c)}>{busy === `reply:${c.facilityId}` ? <><span className="spin" />Sending…</> : "Send suggested reply"}</button> : <button className="btn-ghost" onClick={() => setOpen(c.facilityId)}>Read reply</button>;
      case "copy": { const t = c.sequence?.touches.find((x) => x.step === c.sequence!.step); if (!t) return null;
        if (t.channel !== "phone") return <button className="btn" onClick={() => copied(t)}>Copy note</button>;
        if (p?.phone) return <a className="btn" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} onClick={() => { setOpen(c.facilityId); setStep(t.step); }}>Call {p.name ? p.name.split(" ")[0] : "them"} · {p.phone}</a>;
        return p ? <button className="btn" disabled={busy === `phone:${p.id}`} onClick={() => getPhone(c, p)}>{busy === `phone:${p.id}` ? <><span className="spin" />Finding…</> : `Get ${p.name ? p.name.split(" ")[0] + "'s" : "their"} phone · 3 tokens`}</button> : <button className="btn-ghost" onClick={() => called(t, "no_answer")}>Skip the call</button>; }
      case "active": case "queued": return <button className="btn-ghost" onClick={() => pause(c, true)}>Pause</button>;
      case "paused": return <button className="btn-ghost" onClick={() => pause(c, false)}>Resume</button>;
      default: return null;
    }
  }

  function seqPanel(c: Card) {
    const s = c.sequence; if (!s) return null;
    const touch = s.touches.find((t) => t.step === step) || s.touches[0];
    const first = c.contact?.name?.split(" ")[0] || "{{first}}";
    const sender = senders.find((m) => m.id === (s.mailboxId || senders[0]?.id));
    const show = (t: string) => t.replace(/\{\{first\}\}/g, first).replace(/\{\{signer\}\}/g, sender?.senderName || me?.company || "");
    return (
      <div className="seq-panel">
        {s.replyText && <div className="msg them"><span className="msg-w">{(c.contact?.name || "Them").split(" ")[0]} · Email · {s.replyAt ? new Date(s.replyAt).toLocaleDateString() : ""}</span>{s.replyText}</div>}
        {s.suggested ? (<>
          <div className="draft-label">Suggested reply {s.replyLabel && (() => { const [l, cl] = LABEL[s.replyLabel] || LABEL.unclear; return <span className={`tag ${cl}`}>{l}</span>; })()}</div>
          {edit ? <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /> : <div className="draft">{s.suggested.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</div>}
          {s.quoteNote && <p className="hint" style={{ marginTop: 6 }}><b>Rate basis:</b> {s.quoteNote}</p>}
          <div className="seq-actions"><button className="btn" onClick={() => sendReply(c)} disabled={!canSend || busy === `reply:${c.facilityId}`}>Send as you</button><button className="btn-ghost" onClick={() => setEdit(edit ? null : { subject: "", body: s.suggested! })}>{edit ? "Cancel edit" : "Edit"}</button></div>
        </>) : (<>
          <div className="chan-tabs">{s.touches.filter((t) => t.step < 90).map((t) => <button key={t.id} className={`chan-tab${t.step === step ? " on" : ""}`} onClick={() => { setStep(t.step); setEdit(null); }}>{t.step === 0 ? "Opener" : `Day ${d?.sequence[t.step]?.day}`}{t.channel === "phone" ? " · call" : t.channel === "linkedin" ? " · copy" : ""}{t.status === "sent" ? " ✓" : ""}</button>)}</div>
          {touch && (<>
            <div className="draft-label">{d?.sequence[touch.step]?.name} · {touch.channel === "phone" ? (touch.status === "sent" ? `called · ${(touch.outcome || "done").replace("_", " ")}` : touch.status === "copied" ? "on your call list" : `on your call list from day ${d?.sequence[touch.step]?.day}`) : touch.channel === "linkedin" ? "copy into LinkedIn" : touch.step === 0 ? (touch.status === "sent" ? "sent" : touch.status === "queued" ? "approved, sending soon" : "needs your approval") : touch.status === "sent" ? "sent" : `sends itself on day ${d?.sequence[touch.step]?.day}`}</div>
            {edit && touch.step === 0 && touch.status !== "sent" ? <><input type="text" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} style={{ marginBottom: 8 }} /><textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></>
              : <div className="draft">{touch.subject && touch.channel === "email" && <div className="draft-sub">Subject: {show(touch.subject)}</div>}{touch.channel === "phone" && <div className="draft-sub">Say:</div>}{show(touch.body).split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}{touch.channel === "phone" && touch.subject && <><div className="draft-sub" style={{ marginTop: 10 }}>If it goes to voicemail:</div><span>{show(touch.subject)}</span></>}</div>}
            <div className="seq-actions">
              {touch.channel === "linkedin" && touch.status !== "sent" ? <button className="btn-ghost" onClick={() => copied(touch)}>Copy note</button> : null}
              {touch.channel === "phone" && touch.status !== "sent" ? <>{(c.contact || c.best)?.phone ? <a className="btn" href={`tel:${(c.contact || c.best)!.phone!.replace(/[^\d+]/g, "")}`}>Call {(c.contact || c.best)!.phone}</a> : <span className="hint" style={{ margin: 0 }}>No direct phone yet. {(c.contact || c.best) ? "Get it from the card button, 3 tokens, refunded if none is found." : "Pick a person first."}</span>}<span className="small" style={{ marginLeft: 6 }}>How did it go?</span><button className="btn-ghost" disabled={busy === `call:${touch.id}`} onClick={() => called(touch, "spoke")}>Spoke</button><button className="btn-ghost" disabled={busy === `call:${touch.id}`} onClick={() => called(touch, "voicemail")}>Voicemail</button><button className="btn-ghost" disabled={busy === `call:${touch.id}`} onClick={() => called(touch, "no_answer")}>No answer</button><button className="btn-ghost" disabled={busy === `call:${touch.id}`} onClick={() => called(touch, "wrong_number")}>Wrong number</button></> : null}
              {touch.step === 0 && s.status === "draft" ? <button className="btn-ghost" onClick={() => setEdit(edit ? null : { subject: show(touch.subject || ""), body: show(touch.body) })}>{edit ? "Cancel edit" : "Edit opener"}</button> : null}
              {!c.contact && <span className="hint" style={{ margin: 0 }}>Written to the transportation contact; the first name fills in when you pick a person.</span>}
              {senders.length > 1 && s.status === "draft" && <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>Send from <select value={s.mailboxId || senders[0].id} onChange={(e) => setSender(c, e.target.value)} style={{ width: "auto", padding: "5px 8px", fontSize: 13 }}>{senders.map((m) => <option key={m.id} value={m.id}>{m.senderName ? `${m.senderName} · ${m.address}` : m.address}</option>)}</select></label>}
            </div>
          </>)}
        </>)}
        {c.people.length > 0 && (
          <div className="people-row"><span className="small">People here:</span>{c.people.map((p) => <button key={p.id} className={`chip${c.contact?.id === p.id ? " on" : ""}`} title={p.email ? p.email : p.has.email ? "email on file, 1 token" : "email will be looked up"} disabled={busy === `email:${p.id}`} onClick={() => c.contact?.id === p.id ? null : revealEmail(c, p)}>{p.scope === "hq" ? "HQ · " : ""}{p.name || p.title || "contact"}{p.name && p.title ? <i>{p.title}</i> : null}{p.email ? " ✓" : ""}</button>)}</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="pane-h"><div><h2>Outreach</h2><p>{d ? `${d.cards.filter((c) => c.hold.clear).length} of ${d.cards.length} warehouses have no hold on file. Sequences are written from your history with each warehouse; held warehouses are never touched.` : "Loading…"}</p></div>
        <div style={{ display: "flex", gap: 10 }}>{!hasMailbox && <a className="btn-ghost" href="/app/settings/sources">Connect sending mailbox</a>}<button className="btn-ghost" disabled={busy === "prep:top" || !me?.features.ai} onClick={prepareTop}>{busy === "prep:top" ? <><span className="spin" />Writing…</> : "Write my top 5"}</button></div></div>
      {me && (
        <div className="auto-bar">
          <div><b>Autopilot</b><span className="small"> · {me.autopilot === "send" ? `reaching out to up to ${me.autoPerDay} new shippers a day, inside your ${me.tokens.cap || "unlimited"}-token daily cap, never one on hold` : me.autopilot === "draft" ? "writing sequences for your warmest warehouses; you approve every opener" : "off; nothing is drafted or sent on its own"}</span></div>
          <div className="auto-ctl">
            {(["off", "draft", "send"] as const).map((k) => <button key={k} className={`chip${me.autopilot === k ? " on" : ""}`} disabled={busy === "auto" || (k === "send" && (!canSend || !hasMailbox))} title={k === "send" && !canSend ? "Sending needs Carrier or Fleet" : k === "send" && !hasMailbox ? "Connect a sending mailbox first" : ""} onClick={() => setAuto(k)}>{k === "off" ? "Off" : k === "draft" ? "Draft only" : "Send"}</button>)}
            {me.autopilot === "send" && <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>shippers a day <input type="number" min={0} max={me.limits.perDay || 50} defaultValue={me.autoPerDay} onBlur={(e) => Number(e.target.value) !== me.autoPerDay && setAuto("send", Number(e.target.value))} style={{ width: 64, padding: "5px 8px", fontSize: 13 }} /></label>}
          </div>
        </div>
      )}
      {me && !canSend && <div className="cbox warn" style={{ marginBottom: 18 }}><h4>Sending needs Carrier or Fleet</h4><p style={{ margin: 0 }}>Drafting, finding contacts and reading replies are free. Sends are unlimited on both paid plans.</p></div>}
      <div className="chips">{FILTERS.map(([k, label]) => <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}<i>{counts(k)}</i></button>)}</div>
      {d && !cards.length && <div className="empty"><h3>Nothing here yet</h3><p>{d.cards.length ? "No warehouses under this filter." : "Warehouses appear as your rate cons are read. Each one gets a sequence written from your history there."}</p></div>}
      {cards.map((c) => {
        const [sl, sc] = STATE[c.state] || STATE.needs_draft; const isOpen = open === c.facilityId; const p = c.contact || c.best;
        return (
          <div className={`ocard${isOpen ? " open" : ""}`} key={c.facilityId}>
            <div className="ocard-h" onClick={() => { setOpen(isOpen ? null : c.facilityId); setStep(c.sequence?.status === "draft" ? 0 : Math.min(c.sequence?.step ?? 0, 6)); setEdit(null); }}>
              <div className="ocard-t"><i>{isOpen ? "▾" : "▸"}</i><b>{c.name}</b><span className="small">{c.city}</span> <span className={`tag ${sc}`}>{sl}</span>{c.state === "replied" && c.sequence?.replyLabel && (() => { const [l, cl] = LABEL[c.sequence.replyLabel] || LABEL.unclear; return <span className={`tag ${cl}`} style={{ marginLeft: 4 }}>{l}</span>; })()}</div>
              <div className="ocard-sum">{c.summary}</div>
              <div className={`small${c.hold.clear ? "" : " hold-line"}`}>{c.hold.reason}</div>
              <div className="ocard-meta small">
                {p ? <>{p.name || "Contact"}{p.title ? `, ${p.title}` : ""}{p.email ? ` · ${p.email}` : ""}</> : c.people.length ? `${c.people.length} people in freight roles` : "nobody looked up yet"}
                {c.sequence?.status === "active" && c.sequence.nextAt ? ` · next touch ${new Date(c.sequence.nextAt).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div className="ocard-a" onClick={(e) => e.stopPropagation()}>{primary(c)}</div>
            {isOpen && c.state === "held" && <div className="seq-panel">
              <p className="hint" style={{ marginTop: 0 }}>Nothing is drafted or sent for a warehouse on hold. Each broker below put you at this warehouse; the hold runs from your last load with them. Upload a broker&rsquo;s signed agreement and the app uses the clause as written instead of the 24-month assumption. Read it with your attorney; the app shows dates and documents, not a verdict.</p>
              {c.hold.holds.map((h) => <div key={h.broker} className={`hold-row${h.expired ? " expired" : ""}`}><b>{h.broker}</b><span className="small"> · last load {h.lastLoad} · {h.expired ? "term ran out" : "held until"} {h.until} · {h.source === "agreement" ? `${h.termMonths ?? "?"} months per the agreement${h.coversConsignees ? ", consignees included" : ", shippers only"}` : "assumed 24 months, consignees included"}</span>{h.clause && <blockquote className="clause-q">{h.clause}</blockquote>}</div>)}
            </div>}
            {isOpen && c.state !== "held" && (c.sequence ? seqPanel(c) : <div className="seq-panel"><p className="hint" style={{ margin: 0 }}>No sequence written yet for this warehouse. Writing one is free and takes a few seconds.</p></div>)}
          </div>
        );
      })}
      <details className="panel fold" style={{ marginTop: 20 }}><summary><h3>How a sequence runs</h3><span className="hint" style={{ margin: 0 }}>{d ? `${d.sequence.length} touches over ${d.sequence[d.sequence.length - 1].day} days · you approve the opener, email follow-ups send themselves, the one call is yours to make with a script, everything stops on a reply. Sends are paced: ${me?.sending.emailsPerDay ?? 20} a day per inbox, ${me?.sending.gapMin ?? 3} to ${me?.sending.gapMax ?? 8} minutes apart` : ""}</span></summary>
        <div className="fold-body"><ol className="seq">{d?.sequence.map((s, i) => <li className="seq-step" key={i}><div className="seq-when">Day {s.day}</div><div className="seq-body"><b>{s.name}</b> <span className="seq-ch">{s.channel === "email" ? "Email" : s.channel === "phone" ? "Call" : "LinkedIn"}</span> {s.approve ? <span className="tag t-obs">YOU APPROVE</span> : s.channel === "phone" ? <span className="tag t-inf">YOU CALL</span> : s.channel === "linkedin" ? <span className="tag t-inf">COPY</span> : <span className="tag t-ver">AUTO</span>}</div></li>)}</ol></div></details>
    </>
  );
}
