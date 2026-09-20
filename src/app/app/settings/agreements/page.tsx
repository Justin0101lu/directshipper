"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type Agreement = { id: string; broker: string; termMonths: number | null; fromEvent: string | null; survives: boolean | null; coversConsignees: boolean | null; coversAllLocations: boolean | null; damages: string | null; clause: string; page: string | null; filename: string | null };

export default function Agreements() {
  const { me } = useMe(); const { flash } = useFlash();
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
  return (
    <>
      <div className="pane-h"><div><h2>Broker agreements</h2><p>What each broker&rsquo;s non-solicit says, as written</p></div></div>
      <div className="panel" id="agreements">
        <p className="ph">Every dock a broker sent you to carries that broker&rsquo;s non-solicit until the term runs out. With nothing on file the app assumes the broad version: 24 months from your last load, consignees included. Upload the signed broker-carrier agreement and the app uses the clause as written. A clause that names only the broker&rsquo;s shippers clears the docks you deliver to for that broker. The app shows the clause and the dates; read it with your attorney.</p>
        <label className="btn" style={{ display: "inline-block", cursor: "pointer" }}>{agBusy ? <><span className="spin" />Reading…</> : "Upload agreements (PDF)"}<input type="file" accept="application/pdf" multiple hidden onChange={uploadAg} disabled={agBusy || !me?.features.ai || !me?.limits.agreements} /></label>
        {me && !me.limits.agreements && <p className="hint">Uploading agreements to clear held docks is on Carrier and up. <Link href="/app/settings/billing" style={{ color: "var(--blue)" }}>See plans</Link>.</p>}
        {ags.length > 0 && <table style={{ border: "none", marginTop: 16 }}><thead><tr><th>Broker</th><th>Term</th><th>Runs from</th><th>Reaches consignees</th><th>Survives termination</th><th></th></tr></thead><tbody>
          {ags.map((a) => <tr key={a.id} style={{ cursor: "default" }}><td className="lead">{a.broker}<div className="cell-sub">{a.page || a.filename}</div><details style={{ marginTop: 6 }}><summary className="small" style={{ cursor: "pointer" }}>clause as written</summary><blockquote className="clause-q">{a.clause}</blockquote>{a.damages && <div className="small">Damages: {a.damages}</div>}</details></td>
            <td data-label="Term" className="num">{a.termMonths ? `${a.termMonths} mo` : "not stated"}</td><td data-label="Runs from">{(a.fromEvent || "unknown").replace("_", " ")}</td>
            <td data-label="Reaches consignees">{a.coversConsignees ? <span className="tag t-flag">YES</span> : <span className="tag t-ver">SHIPPERS ONLY</span>}</td><td data-label="Survives termination">{a.survives ? "yes" : "no"}</td>
            <td data-label="" className="right"><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={() => removeAg(a.id)}>Remove</button></td></tr>)}
        </tbody></table>}
      </div>
    </>
  );
}
