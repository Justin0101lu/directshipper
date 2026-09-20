"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type Touch = { id: string; step: number; channel: string; subject: string | null; body: string; status: string; sentAt: string | null };
type Seq = { id: string; status: string; step: number; nextAt: string | null; replyLabel: string | null; replyText: string | null; replyAt: string | null; suggested: string | null;
  contact: { id: string; name: string | null; email: string | null; title: string | null }; facility: { id: string; name: string; city: string; state: string }; touches: Touch[]; next: Touch | null };
type Data = { queue: Seq[]; sequence: { day: number; channel: string; name: string; approve: boolean }[] };

const LABEL: Record<string, [string, string]> = { interested: ["INTERESTED", "t-ver"], send_paperwork: ["SEND PAPERWORK", "t-ver"], not_now: ["NOT NOW", "t-inf"], wrong_person: ["WRONG PERSON", "t-inf"], unsubscribe: ["UNSUBSCRIBE", "t-flag"], unclear: ["REPLIED", "t-obs"] };

export default function Outreach() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [d, setD] = useState<Data | null>(null); const [sel, setSel] = useState<string | null>(null); const [stepSel, setStepSel] = useState(0);
  const [edit, setEdit] = useState<{ subject: string; body: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Data>("/api/outreach").then((x) => { setD(x); setSel((s) => s ?? x.queue[0]?.id ?? null); }), []);
  useEffect(() => { load(); }, [load]);
  const seq = d?.queue.find((s) => s.id === sel) || null;
  const touch = seq?.touches.find((t) => t.step === stepSel) || seq?.touches[0] || null;
  useEffect(() => { setEdit(null); setStepSel(seq?.status === "draft" ? 0 : Math.min(seq?.step ?? 0, 6)); }, [sel, seq?.status, seq?.step]);
  const canSend = me && me.plan !== "free";
  const hasMailbox = me?.mailboxes.some((m) => m.kind === "gmail_imap" || m.kind === "microsoft");

  async function approve() {
    if (!seq) return; setBusy(true);
    try { await api("/api/outreach/approve", { method: "POST", json: { sequenceId: seq.id, subject: edit?.subject, body: edit?.body } }); flash("Sent as you. The follow-ups are scheduled and stop the moment they reply."); setEdit(null); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/billing"); } finally { setBusy(false); }
  }
  async function sendReply() {
    if (!seq || !seq.suggested) return; setBusy(true);
    try { await api("/api/outreach/reply", { method: "POST", json: { sequenceId: seq.id, body: edit?.body ?? seq.suggested } }); flash("Reply sent as you."); setEdit(null); await load(); }
    catch (e) { flash((e as Error).message, "err"); } finally { setBusy(false); }
  }
  async function copied(t: Touch) { navigator.clipboard?.writeText(t.body); await api("/api/outreach/copied", { method: "POST", json: { touchId: t.id } }); flash("Copied. Paste it into LinkedIn; the step is marked done."); load(); }

  function status(s: Seq) {
    if (s.replyLabel) { const [l, c] = LABEL[s.replyLabel] || LABEL.unclear; return <span className={`tag ${c}`}>{l}</span>; }
    if (s.status === "draft") return <span className="tag t-obs">OPENER NEEDS APPROVAL</span>;
    if (s.status === "paused") return <span className="tag t-flag">PAUSED</span>;
    if (s.status === "done") return <span className="tag t-inf">SEQUENCE DONE</span>;
    if (s.next?.channel === "linkedin" && s.next.status === "copied") return <span className="tag t-obs">COPY TO LINKEDIN</span>;
    return <span className="tag t-ver">ACTIVE · STEP {s.step + 1}</span>;
  }

  return (
    <>
      <div className="pane-h"><div><h2>Outreach</h2><p>{d ? `${d.sequence.length} touches over ${d.sequence[d.sequence.length - 1].day} days. Approve the opener, the rest sends itself, and it stops the moment they reply.` : "Loading…"}</p></div>
        {!hasMailbox && <div><a className="btn-ghost" href="/app/sources">Connect sending mailbox</a></div>}</div>
      {me && !canSend && <div className="cbox warn" style={{ marginBottom: 18 }}><h4>Sending needs Carrier or Fleet</h4><p style={{ margin: 0 }}>Drafting and reading are free. Sends are unlimited on both paid plans, with no per-seat and no per-mailbox fee.</p></div>}
      <div className="grid2 or-grid">
        <div className="panel" style={{ marginBottom: 0 }}><h3>Queue</h3><p className="ph">Nothing sends without you. Every touch goes out under your name. Click a row to see its draft.</p>
          <table style={{ border: "none" }}><thead><tr><th>Who</th><th>Next touch</th><th>Reply</th><th>Status</th></tr></thead><tbody>
            {d && !d.queue.length && <tr style={{ cursor: "default" }}><td colSpan={4} style={{ color: "var(--faint)" }}>Nothing queued. Reveal a contact under Prospects and click Add to outreach.</td></tr>}
            {d?.queue.map((s) => <tr key={s.id} className={s.id === sel ? "sel" : ""} onClick={() => setSel(s.id)}>
              <td className="lead">{s.facility.name}<div className="cell-sub">{s.contact.name || "no name yet"}</div></td>
              <td data-label="Next touch">{s.next ? `${d.sequence[s.next.step]?.name ?? ""}` : "—"}<div className="cell-sub">{s.next ? s.next.channel : ""}{s.nextAt && s.status === "active" ? ` · ${new Date(s.nextAt).toLocaleDateString()}` : ""}</div></td>
              <td data-label="Reply">{s.replyLabel ? (() => { const [l, c] = LABEL[s.replyLabel] || LABEL.unclear; return <span className={`tag ${c}`}>{l}</span>; })() : <span className="hint" style={{ margin: 0 }}>&mdash;</span>}</td>
              <td data-label="Status">{status(s)}</td></tr>)}
          </tbody></table></div>
        <div className="panel" style={{ marginBottom: 0 }}>
          {!seq ? <p className="hint">Select a row.</p> : (<>
            <h3>{seq.facility.name} &mdash; {seq.contact.name || "contact"} <span style={{ marginLeft: 6 }}>{status(seq)}</span></h3>
            <p className="ph">{seq.contact.title ? seq.contact.title + " · " : ""}{seq.facility.city}, {seq.facility.state}{seq.contact.email ? " · " + seq.contact.email : ""}</p>
            {seq.replyText && <div className="msg them"><span className="msg-w">{(seq.contact.name || "Them").split(" ")[0]} · Email · {seq.replyAt ? new Date(seq.replyAt).toLocaleDateString() : ""}</span>{seq.replyText}</div>}
            {seq.suggested ? (<>
              <div className="draft-label">Suggested reply</div>
              {edit ? <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /> : <div className="draft">{seq.suggested.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}><button className="btn" onClick={sendReply} disabled={busy || !canSend}>{busy ? <><span className="spin" />Sending…</> : "Approve & send"}</button><button className="btn-ghost" onClick={() => setEdit(edit ? null : { subject: "", body: seq.suggested! })}>{edit ? "Cancel edit" : "Edit"}</button></div>
              <p className="hint">The sequence stopped when they replied. This is the only thing queued for them.</p></>)
            : seq.status === "paused" && seq.replyLabel === "not_now" ? <><div className="draft-label">Sequence paused</div><div className="draft"><div className="draft-sub">Nothing queued</div>They said not now{seq.nextAt ? `. A fresh opener is queued for ${new Date(seq.nextAt).toLocaleDateString()} and waits for your approval.` : "."}</div></>
            : (<>
              <div className="chan-tabs">{seq.touches.filter((t) => t.step < 90).map((t) => <button key={t.id} className={`chan-tab${t.step === stepSel ? " on" : ""}`} onClick={() => { setStepSel(t.step); setEdit(null); }} title={d?.sequence[t.step]?.name}>{t.step === 0 ? "Opener" : `Day ${d?.sequence[t.step]?.day}`}{t.channel === "linkedin" ? " · copy" : ""}{t.status === "sent" ? " ✓" : ""}</button>)}</div>
              {touch && (<>
                <div className="draft-label">{d?.sequence[touch.step]?.name} · {touch.channel === "linkedin" ? "copy into LinkedIn" : touch.step === 0 ? (touch.status === "sent" ? "sent" : "needs your approval") : touch.status === "sent" ? "sent" : "sends itself"}</div>
                {edit && touch.step === 0 && touch.status !== "sent" ? <><input type="text" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} style={{ marginBottom: 8 }} /><textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></>
                  : <div className="draft">{touch.subject && touch.channel === "email" && <div className="draft-sub">Subject: {touch.subject}</div>}{touch.body.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  {touch.channel === "linkedin" ? <button className="btn" onClick={() => copied(touch)}>Copy note</button>
                    : touch.step === 0 && seq.status === "draft" ? <><button className="btn" onClick={approve} disabled={busy || !canSend || !hasMailbox}>{busy ? <><span className="spin" />Sending…</> : "Approve & send"}</button><button className="btn-ghost" onClick={() => setEdit(edit ? null : { subject: touch.subject || "", body: touch.body })}>{edit ? "Cancel edit" : "Edit"}</button></>
                    : null}
                </div>
                <p className="hint">{touch.channel === "linkedin" ? "Pasted by you, never automated. Automating LinkedIn gets accounts restricted." : touch.step === 0 ? "Approve the opener once. The follow-ups send themselves and stop the moment they reply." : `Sends on day ${d?.sequence[touch.step]?.day} unless they reply first.`}{!hasMailbox && " Connect a Gmail or Outlook mailbox first."}</p></>)}
            </>)}
          </>)}
        </div>
      </div>
      <details className="panel fold" style={{ marginTop: 20 }}><summary><h3>Sequence settings</h3><span className="hint" style={{ margin: 0 }}>{d ? `${d.sequence.length} touches over ${d.sequence[d.sequence.length - 1].day} days · email sends itself, LinkedIn is copy-only` : ""}</span></summary>
        <div className="fold-body"><ol className="seq">{d?.sequence.map((s, i) => <li className="seq-step" key={i}><div className="seq-when">Day {s.day}</div><div className="seq-body"><b>{s.name}</b> <span className="seq-ch">{s.channel === "email" ? "Email" : "LinkedIn"}</span> {s.approve ? <span className="tag t-obs">YOU APPROVE</span> : s.channel === "linkedin" ? <span className="tag t-inf">COPY</span> : <span className="tag t-ver">AUTO</span>}</div></li>)}</ol></div></details>
    </>
  );
}
