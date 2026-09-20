"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type Profile = { loads: number; from: string | null; to: string | null; families: { name: string; pct: number }[]; equipment: { name: string; pct: number }[]; avgMiles: number | null; avgPerMile: number | null; busiestMonth: string | null; lanes: { lane: string; loads: number; perMile: number | null; origin: string; dest: string }[]; deadhead: { city: string; pct: number; deliveries: number }[]; brokers: { name: string; loads: number; perMile: number | null; lastAt: string | null }[]; home: string | null };
type Load = { id: string; date: string | null; loadNumber: string | null; broker: string | null; shipper: string | null; facility: string | null; dest: string | null; lane: string; equipment: string | null; miles: number | null; rate: number | null; perMile: number | null; status: string; median: number | null };
const EQ: Record<string, string> = { reefer: "Reefer", dry_van: "Dry van", flatbed: "Flatbed" };

export default function Freight() {
  const { me } = useMe(); const { flash } = useFlash();
  const [p, setP] = useState<Profile | null>(null); const [loads, setLoads] = useState<Load[] | null>(null);
  const [q, setQ] = useState(""); const [st, setSt] = useState("all"); const [eq, setEq] = useState("all"); const [show, setShow] = useState(50);
  useEffect(() => { api<Profile>("/api/profile").then(setP).catch((e) => flash(e.message, "err")); api<Load[]>("/api/loads").then(setLoads).catch(() => {}); }, [flash]);
  const rows = useMemo(() => (loads || []).filter((l) => (st === "all" || l.status === st) && (eq === "all" || l.equipment === eq) && (!q || `${l.facility} ${l.shipper} ${l.broker} ${l.lane} ${l.loadNumber}`.toLowerCase().includes(q.toLowerCase()))), [loads, q, st, eq]);
  const pct = (v: number) => `${v}%`;
  const hasLoads = !!p && p.loads > 0;
  async function exportCsv() { const r = await fetch("/api/loads/export"); if (!r.ok) { flash((await r.json()).error, "err"); return; } const b = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "loads.csv"; a.click(); }
  return (
    <>
      <div className="pane-h"><div><h2>My freight</h2><p>{p ? (hasLoads ? `What Direct Shipper learned from ${p.loads.toLocaleString()} rate cons${p.from ? `, ${p.from} to ${p.to}` : ""}` : "Nothing read yet") : "Loading…"}</p></div>
        <div style={{ display: "flex", gap: 10 }}><Link className="btn-ghost" href="/app?chip=look">Find lookalikes</Link></div></div>
      {p && !hasLoads && <div className="empty"><h3>No rate cons yet</h3><p>Connect your inbox or drop in a few PDFs and this page fills in on its own.</p><Link className="btn" href="/app/sources">Connect a source</Link></div>}
      {hasLoads && p && (<>
        <div className="panel" style={{ borderLeft: "3px solid var(--blue)" }}><h3>What you haul</h3><p className="ph">Most carriers guess at this. Here is what your own paperwork says.</p>
          <div className="grid2"><div><div className="bars">{p.families.map((f) => <div className="bar" key={f.name}><span className="lbl">{f.name}</span><span className="track"><span className="fill" style={{ width: pct(f.pct) }}></span></span><span className="v">{f.pct}%</span></div>)}</div></div>
            <div><dl><div className="row"><dt>Equipment</dt><dd>{p.equipment.map((e) => `${e.name} ${e.pct}%`).join(" · ") || "—"}</dd></div><div className="row"><dt>Average length of haul</dt><dd>{p.avgMiles ? `${p.avgMiles} mi` : "—"}</dd></div><div className="row"><dt>Average rate per mile</dt><dd>{p.avgPerMile ? `$${p.avgPerMile.toFixed(2)}` : "—"}</dd></div><div className="row"><dt>Busiest month</dt><dd>{p.busiestMonth || "—"}</dd></div><div className="row"><dt>Home base</dt><dd>{p.home || "—"}</dd></div><div className="row"><dt>Loads analyzed</dt><dd>{p.loads}</dd></div></dl></div></div></div>
        <div className="grid2">
          <div className="panel"><h3>Your lanes, by what they actually pay</h3><p className="ph">Ranked by rate per mile, not by how often you run them. Lanes with three or more loads.</p>
            <table style={{ border: "none" }}><thead><tr><th>Lane</th><th className="right">Loads</th><th className="right">$/mi</th></tr></thead><tbody>{p.lanes.map((l) => <tr key={l.lane} style={{ cursor: "default" }}><td className="lead">{l.lane}</td><td data-label="Loads" className="num right">{l.loads}</td><td data-label="$/mi" className="num right">{l.perMile ? `$${l.perMile.toFixed(2)}` : "—"}</td></tr>)}{!p.lanes.length && <tr style={{ cursor: "default" }}><td colSpan={3} className="small">Not enough repeat lanes yet.</td></tr>}</tbody></table>
            {p.lanes.length > 2 && (() => { const busiest = [...p.lanes].sort((a, b) => b.loads - a.loads)[0]; const rank = p.lanes.findIndex((l) => l.lane === busiest.lane) + 1; return rank > 1 ? <p className="hint">Your highest-volume lane is your {rank === 2 ? "second" : rank === 3 ? "third" : `#${rank}`} best paying. Worth knowing before you renew anything.</p> : null; })()}</div>
          <div className="panel"><h3>Where you&rsquo;re running empty</h3><p className="ph">Deliveries with no loaded pickup from that city within 48 hours.</p>
            <div className="bars">{p.deadhead.map((d) => <div className="bar" key={d.city}><span className="lbl">{d.city}</span><span className="track"><span className="fill" style={{ width: pct(d.pct), background: d.pct >= 40 ? "var(--red)" : undefined }}></span></span><span className="v">{d.pct}%</span></div>)}{!p.deadhead.length && <p className="small">Needs delivery dates on a few more rate cons.</p>}</div>
            {p.deadhead[0] && p.deadhead[0].pct >= 40 && <><p className="hint" style={{ marginTop: 14 }}>{p.deadhead[0].pct}% of your {p.deadhead[0].city} runs come back empty. Direct Shipper can look for shippers outbound from there that match your profile.</p><Link className="btn" style={{ marginTop: 12, display: "inline-block" }} href={`/app?chip=look&state=${encodeURIComponent(p.deadhead[0].city.split(" ").pop() || "")}`}>Find {p.deadhead[0].city.split(" ")[0]} outbound</Link></>}</div>
        </div>
        <div className="panel"><h3>Brokers, by what they pay you</h3><p className="ph">Every broker on a rate con we have read.</p>
          <table style={{ border: "none" }}><thead><tr><th>Broker</th><th className="right">Loads</th><th className="right">$/mi</th><th className="right">Last load</th></tr></thead><tbody>{p.brokers.slice(0, 12).map((b) => <tr key={b.name} style={{ cursor: "default" }}><td className="lead">{b.name}</td><td data-label="Loads" className="num right">{b.loads}</td><td data-label="$/mi" className="num right">{b.perMile ? `$${b.perMile.toFixed(2)}` : "—"}</td><td data-label="Last load" className="num right">{b.lastAt || "—"}</td></tr>)}</tbody></table></div>
        <div className="panel" id="loads"><div className="pane-h" style={{ marginBottom: 14 }}><div><h3>Every load</h3><p className="small">Every rate con we have read, newest first{me?.mailboxes.length ? <> &middot; <Link className="lnk" href="/app/sources">sources</Link></> : null}</p></div>
            <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" onClick={exportCsv}>Export CSV</button></div></div>
          <div className="lv"><div className="lv-tools"><input className="lv-search" type="text" placeholder="Search facility, shipper, broker, lane or load number" value={q} onChange={(e) => { setQ(e.target.value); setShow(50); }} />
              <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="ok">Resolved</option><option value="unres">Unresolved</option><option value="flag">Rate low</option></select>
              <select value={eq} onChange={(e) => setEq(e.target.value)} aria-label="Filter by equipment"><option value="all">All equipment</option><option value="reefer">Reefer</option><option value="dry_van">Dry van</option><option value="flatbed">Flatbed</option></select>
              <span className="lv-count">{loads ? `${rows.length.toLocaleString()} of ${loads.length.toLocaleString()} · ${Math.min(show, rows.length)} shown` : ""}</span></div>
            <div className="lv-head lv-cols"><div className="lv-h">Date</div><div className="lv-h">Facility</div><div className="lv-h">Shipper</div><div className="lv-h">Broker</div><div className="lv-h">Lane</div><div className="lv-h">Equip</div><div className="lv-h">Rate</div><div className="lv-h">Status</div></div>
            <div>{rows.slice(0, show).map((l) => <div className="lv-row lv-cols" key={l.id} style={{ cursor: "default" }}><div className="lv-c lv-date">{l.date || ""}</div><div className="lv-c lv-fac">{l.facility || l.lane.split(" →")[0]}</div><div className={`lv-c lv-shipper${l.shipper ? "" : " lv-dim"}`}>{l.shipper || "Unresolved"}</div><div className="lv-c lv-broker lv-dim">{l.broker || ""}</div><div className="lv-c lv-lane">{l.lane}</div><div className="lv-c lv-eq lv-dim">{EQ[l.equipment || ""] || ""}</div><div className="lv-c lv-rate">{l.rate ? `$${Math.round(l.rate).toLocaleString()}` : ""}</div><div className="lv-c lv-status">{l.status === "flag" ? <span className="tag t-flag" title={`Your median on this lane is $${l.median?.toFixed(2)}/mi. This one paid $${l.perMile?.toFixed(2)}.`}>RATE LOW</span> : l.status === "ok" ? <span className="tag t-ver">RESOLVED</span> : <span className="tag t-inf">UNRESOLVED</span>}</div></div>)}
              {loads && !rows.length && <div className="lv-empty">No loads match that.</div>}</div>
            {rows.length > show && <div className="lv-more"><button className="btn-ghost" onClick={() => setShow(show + 100)}>Load {Math.min(100, rows.length - show)} more · {(rows.length - show).toLocaleString()} left</button></div>}</div></div>
      </>)}
      <div className="panel"><h3>Add more history</h3><p className="ph">The further back you go, the better the matching gets. Seasonality especially needs a couple of years.</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn-ghost" href="/app/sources">Connect an inbox or upload rate cons</Link></div></div>
    </>
  );
}
