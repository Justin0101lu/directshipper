"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";
import { MailConnect } from "@/components/MailConnect";

export default function Sources() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [busy, setBusy] = useState(false);
  async function scan() {
    setBusy(true);
    try { const out = await api<Record<string, { stored: number; errors: string[] }>>("/api/mail/sync", { method: "POST" });
      const stored = Object.values(out).reduce((n, x) => n + (x.stored || 0), 0);
      flash(`Scan done. ${stored} new rate con${stored === 1 ? "" : "s"} read.`); refresh(); }
    catch (x) { flash((x as Error).message, "err"); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm("Delete every load, contact, sequence and mailbox on this account? This cannot be undone.")) return;
    await api("/api/account", { method: "DELETE" }); r.push("/");
  }
  const KIND: Record<string, string> = { gmail_imap: "Gmail", microsoft: "Outlook", forward: "Forwarding", upload: "Uploads" };
  async function remove(id: string, address: string) {
    if (!confirm(`Disconnect ${address}? The stored password is deleted. Loads already read stay.`)) return;
    try { await api(`/api/mail/${id}`, { method: "DELETE" }); flash(`${address} disconnected.`); refresh(); } catch (x) { flash((x as Error).message, "err"); }
  }
  async function rescan(id: string) {
    setBusy(true);
    try { const r = await api<{ stored: number; errors: string[] }>(`/api/mail/${id}/rescan`, { method: "POST" });
      flash(r.errors.length && !r.stored ? `Rescan started, but reading failed: ${r.errors[0]}` : `Rescan started from the oldest message. First pass read ${r.stored} rate con${r.stored === 1 ? "" : "s"}; the rest continues every 10 minutes.`, r.errors.length && !r.stored ? "err" : "ok"); refresh(); }
    catch (x) { flash((x as Error).message, "err"); } finally { setBusy(false); }
  }
  const progress = (m: NonNullable<typeof me>["mailboxes"][number]) => {
    if (m.kind === "upload" || m.kind === "forward") return `${m.readCount} loads`;
    if (m.status === "error") return m.error || "error";
    if (m.historyDone) return `${m.readCount} loads read \u00b7 up to date`;
    const passes = Math.ceil(m.queued / 60), mins = passes * 10;
    return `${m.readCount} loads read \u00b7 about ${m.queued.toLocaleString()} messages still to read (${mins >= 60 ? `~${Math.round(mins / 60)} h` : `~${mins} min`} more)`;
  };
  return (
    <>
      <Link className="back" href="/app">&larr; Back to Prospects</Link>
      <div className="pane-h"><div><div className="eyebrow">Settings</div><h2>Sources</h2><p>Where your loads come in from</p></div>
        <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" onClick={scan} disabled={busy || !me?.mailboxes.some((m) => m.kind === "gmail_imap" || m.kind === "microsoft")}>{busy ? <><span className="spin" />Scanning…</> : "Scan now"}</button></div></div>
      {me && me.mailboxes.length > 0 && (
        <div className="panel"><h3>Connected</h3>
          <table style={{ border: "none" }}><thead><tr><th>Source</th><th>Address</th><th>Status</th><th>Progress</th><th>Last read</th><th></th></tr></thead><tbody>
            {me.mailboxes.map((m) => <tr key={m.id} style={{ cursor: "default" }}><td className="lead">{KIND[m.kind] || m.kind}</td><td data-label="Address" className="num">{m.address}</td>
              <td data-label="Status">{m.kind === "upload" || m.kind === "forward" ? <span className="tag t-ver">ACTIVE</span> : m.status === "error" ? <span className="tag t-flag" title={m.error || ""}>ERROR</span> : m.historyDone ? <span className="tag t-ver">UP TO DATE</span> : <span className="tag t-obs">READING HISTORY</span>}</td>
              <td data-label="Progress">{progress(m)}</td>
              <td data-label="Last read" className="num">{m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString() : "—"}</td>
              <td data-label="" className="right">{(m.kind === "gmail_imap" || m.kind === "microsoft") && <span style={{ display: "inline-flex", gap: 6 }}><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={() => rescan(m.id)} disabled={busy} title="Start the history walk over from the oldest message">Rescan</button><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={() => remove(m.id, m.address)}>Remove</button></span>}</td></tr>)}
          </tbody></table>
          <p className="hint">The first scan walks your whole mailbox oldest-first, 60 messages every 10 minutes. Rate cons found during that scan are read in half-price batches: results land within the hour, at most a day.{me.batchQueue ? ` ${me.batchQueue} waiting on a batch right now.` : ""} You can close this window; it keeps going. After the history is in, new rate cons are read within 10 minutes of landing.</p>
          {me.mailboxes.some((m) => m.error) && <p className="hint" style={{ color: "var(--red)" }}>{me.mailboxes.filter((m) => m.error).map((m) => `${m.address}: ${m.error}`).join(" · ")}</p>}
        </div>
      )}
      <MailConnect me={me} onDone={refresh} compact />
      <div className="panel" style={{ marginTop: 20 }}><h3>Where the data comes from</h3>
        <p className="ph">Some of it is yours. Some we buy and pass along. You should be able to tell which is which on any figure you see.</p>
        <div className="srcgrid" style={{ marginTop: 18 }}>
          {[["Yours", "Your rate cons", "What you haul, where, for whom, at what rate. Read once, kept private, and the basis of every match."], ["Network", "Facility observations", "Published only once enough unrelated carriers have moved freight through a dock that no single load can be traced back."], ["Bought", "Emails & phones", `Contact providers tried in order until one returns a verified result.${me?.features.providers.length ? " Live: " + me.features.providers.join(", ") + "." : " None configured yet."}`], ["Free", "FMCSA", "Operating authority and status. Public record, never charged for."]].map(([b, h, p]) => <div className="src" key={h}><div className="big">{b}</div><h4>{h}</h4><p>{p}</p></div>)}
        </div>
      </div>
      <div className="panel" id="data"><h3>Your data</h3>
        <p className="ph">Your rates and broker names are never shown to another customer, and Direct Shipper never surfaces a shipper to anyone because you hauled it for their broker. Delete everything and your freight stops counting toward aggregate figures immediately.</p>
        <button className="btn-ghost" onClick={del}>Delete my data</button></div>
    </>
  );
}
