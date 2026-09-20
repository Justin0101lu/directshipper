"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";
import { MailConnect } from "@/components/MailConnect";

type Agreement = { id: string; broker: string; termMonths: number | null; fromEvent: string | null; survives: boolean | null; coversConsignees: boolean | null; coversAllLocations: boolean | null; damages: string | null; clause: string; page: string | null; filename: string | null };

export default function Sources() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [ags, setAgs] = useState<Agreement[]>([]); const [agBusy, setAgBusy] = useState(false);
  const loadAgs = () => api<Agreement[]>("/api/agreements").then(setAgs).catch(() => {});
  useEffect(() => { loadAgs(); }, []);
  async function uploadAg(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files?.length) return;
    setAgBusy(true);
    const fd = new FormData(); Array.from(files).forEach((f) => fd.append("files", f));
    try { const out = await api<{ filename: string; broker?: string; error?: string; note?: string; termMonths?: number | null; coversConsignees?: boolean }[]>("/api/agreements", { method: "POST", body: fd });
      const ok = out.filter((o) => !o.error && !o.note);
      flash(ok.length ? `Read ${ok.length} agreement${ok.length === 1 ? "" : "s"}: ${ok.map((o) => `${o.broker} (${o.termMonths ?? "no term stated"} mo, ${o.coversConsignees ? "consignees included" : "shippers only"})`).join("; ")}.` : (out[0]?.error || out[0]?.note || "Nothing read."), ok.length ? "ok" : "err");
      loadAgs(); }
    catch (x) { flash((x as Error).message, "err"); } finally { setAgBusy(false); e.target.value = ""; }
  }
  async function removeAg(id: string) { await api("/api/agreements", { method: "DELETE", json: { id } }); loadAgs(); }
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
      <div className="panel" id="agreements"><h3>Broker agreements</h3>
        <p className="ph">Every dock a broker sent you to carries that broker&rsquo;s non-solicit until the term runs out. With nothing on file the app assumes the broad version: 24 months from your last load, consignees included. Upload the signed broker-carrier agreement and the app uses the clause as written. A clause that names only the broker&rsquo;s shippers clears the docks you deliver to for that broker. The app shows the clause and the dates; read it with your attorney.</p>
        <label className="btn" style={{ display: "inline-block", cursor: "pointer" }}>{agBusy ? <><span className="spin" />Reading…</> : "Upload agreements (PDF)"}<input type="file" accept="application/pdf" multiple hidden onChange={uploadAg} disabled={agBusy || !me?.features.ai} /></label>
        {ags.length > 0 && <table style={{ border: "none", marginTop: 16 }}><thead><tr><th>Broker</th><th>Term</th><th>Runs from</th><th>Reaches consignees</th><th>Survives termination</th><th></th></tr></thead><tbody>
          {ags.map((a) => <tr key={a.id} style={{ cursor: "default" }}><td className="lead">{a.broker}<div className="cell-sub">{a.page || a.filename}</div><details style={{ marginTop: 6 }}><summary className="small" style={{ cursor: "pointer" }}>clause as written</summary><blockquote className="clause-q">{a.clause}</blockquote>{a.damages && <div className="small">Damages: {a.damages}</div>}</details></td>
            <td data-label="Term" className="num">{a.termMonths ? `${a.termMonths} mo` : "not stated"}</td><td data-label="Runs from">{(a.fromEvent || "unknown").replace("_", " ")}</td>
            <td data-label="Reaches consignees">{a.coversConsignees ? <span className="tag t-flag">YES</span> : <span className="tag t-ver">SHIPPERS ONLY</span>}</td><td data-label="Survives termination">{a.survives ? "yes" : "no"}</td>
            <td data-label="" className="right"><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={() => removeAg(a.id)}>Remove</button></td></tr>)}
        </tbody></table>}
      </div>
      <div className="panel" id="data"><h3>Your data</h3>
        <p className="ph">Your rates and broker names are never shown to another customer, and Direct Shipper never surfaces a shipper to anyone because you hauled it for their broker. Delete everything and your freight stops counting toward aggregate figures immediately.</p>
        <button className="btn-ghost" onClick={del}>Delete my data</button></div>
    </>
  );
}
