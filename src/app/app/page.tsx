"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { REVEAL_COST as COST } from "@/lib/plans";
import { api, tok } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type StopRef = { facilityId: string | null; city: string | null; state: string | null };
type Load = { id: string; date: string | null; loadNumber: string | null; broker: string | null; authorityId: string | null; carrierName: string | null; lane: string; equipment: string | null; family: string | null; miles: number | null; rate: number | null; perMile: number | null; median: number | null; commodity: string | null; pickups: StopRef[]; drops: StopRef[] };
type Fac = { id: string; name: string; city: string; state: string; type: string; shipper: string | null; discoveredAt: string | null };
type Outbound = { ok: true; loadsPerMonth: number; accounts: number; lanes: { dest: string; pct: number }[]; equipment: string | null; family: string | null } | { ok: false; accounts: number };
type Dock = { facilityId: string; name: string; city: string; deliveries: number; pickups: number; outbound: Outbound; standing: string; why: string };
type Look = { facilityId: string; name: string; city: string; family: string | null; equipment: string | null; loadsPerMonth: number; match: string; revealed: boolean };
type Person = { id: string; title: string | null; name: string | null; linkedin: string | null; email: string | null; emailStatus: string | null; phone: string | null; has: Record<string, boolean> };
type Data = { loads: Load[]; facilities: Record<string, Fac>; docks: Record<string, Dock>; receivers: Dock[]; lookalikes: { family: string; equipment: string; rows: Look[]; excluded: number; thin: boolean }; contacts: Record<string, Person[]> };

const EQ: Record<string, string> = { reefer: "Reefer", dry_van: "Dry van", flatbed: "Flatbed" };
const FAM: Record<string, string> = { frozen: "Frozen & refrigerated", produce: "Produce", beverage: "Beverage", dry: "Dry" };
const FIELDS = [["name", "Name"], ["linkedin", "LinkedIn"], ["email", "Email"], ["phone", "Phone"]] as const;

export default function Prospects() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [d, setD] = useState<Data | null>(null); const [chip, setChip] = useState<"loads" | "docks" | "look">("loads");
  const [open, setOpen] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [show, setShow] = useState(60);
  const [search, setSearch] = useState({ state: "", equipment: "", family: "", min: "4" }); const [est, setEst] = useState("");
  const load = useCallback(() => api<Data>(`/api/prospects?${new URLSearchParams(Object.fromEntries(Object.entries(search).filter(([, v]) => v)))}`).then(setD).catch((e) => flash(e.message, "err")), [search, flash]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, []);

  const fac = (id: string | null) => (id && d?.facilities[id]) || null;
  const nameOf = (s: StopRef) => fac(s.facilityId)?.name || [s.city, s.state].filter(Boolean).join(", ") || "Unknown dock";
  const people = (fid: string) => d?.contacts[fid] || [];

  async function discover(fid: string) {
    setBusy(`disc:${fid}`);
    try { const x = await api<{ count: number }>("/api/contacts/discover", { method: "POST", json: { facilityId: fid } }); flash(x.count ? `${x.count} people in freight roles found. Titles are free; a name, email or phone is one token each.` : "No one in a freight role found at this company yet."); await load(); }
    catch (e) { flash((e as Error).message, "err"); } finally { setBusy(null); }
  }
  async function reveal(contactId: string, field: string) {
    setBusy(`${contactId}:${field}`);
    try { const x = await api<{ found: boolean; charged: number }>("/api/contacts/reveal", { method: "POST", json: { contactId, field } }); flash(x.found ? (x.charged ? "Found. 1 token." : "Already yours.") : "Nothing found. Nothing charged."); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/settings/billing"); }
    finally { setBusy(null); }
  }
  async function startOutreach(contactId: string) {
    setBusy(`seq:${contactId}`);
    try { await api("/api/outreach/start", { method: "POST", json: { contactId } }); flash("Sequence drafted. Approve the opener under Outreach."); r.push("/app/outreach"); }
    catch (e) { flash((e as Error).message, "err"); } finally { setBusy(null); }
  }
  async function estimate() {
    try { const x = await api<{ count: number; excluded: number; thin: boolean; family: string; equipment: string }>("/api/prospects/lookalikes", { method: "POST", json: { ...search, min: Number(search.min), estimate: true } });
      setEst(x.thin ? "The network has not seen enough freight like yours yet. Every rate con you add moves it forward." : `${x.count} new lookalike${x.count === 1 ? "" : "s"} match (${FAM[x.family] || x.family}, ${EQ[x.equipment] || x.equipment}). One token each = ${tok(x.count)}. ${x.excluded} excluded as broker relationships. Nothing charged yet.`); }
    catch (e) { flash((e as Error).message, "err"); }
  }
  async function runSearch() {
    setBusy("search");
    try { const x = await api<{ revealed: number }>("/api/prospects/lookalikes", { method: "POST", json: { ...search, min: Number(search.min) } }); flash(`${x.revealed} lookalikes revealed for ${tok(x.revealed)}.`); setEst(""); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/settings/billing"); }
    finally { setBusy(null); }
  }

  const loads = useMemo(() => (d?.loads || []).filter((l) => !q || `${l.broker} ${l.lane} ${l.loadNumber} ${l.commodity} ${[...l.pickups, ...l.drops].map(nameOf).join(" ")}`.toLowerCase().includes(q.toLowerCase())), [d, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const unrevealed = d?.lookalikes.rows.filter((x) => !x.revealed).length ?? 0;

  /* The dock panel: what we know, who works there. */
  const toggle = (key: string) => setOpen(open === key ? null : key);

  function dockPanel(fid: string, colSpan: number, key: string) {
    const f = fac(fid); const dk = d?.docks[fid]; const ps = people(fid);
    if (!f) return null;
    const ob = dk?.outbound;
    const facts = [
      dk?.deliveries ? `${dk.deliveries} deliveries` : null,
      dk?.pickups ? `${dk.pickups} pickups` : null,
      ob?.ok ? `ships ${ob.loadsPerMonth}/mo${ob.lanes[0] ? ` · ${ob.lanes.map((l) => `${l.dest} ${l.pct}%`).join(" · ")}` : ""}` : `outbound unknown (${ob?.accounts ?? 0} other carrier${ob?.accounts === 1 ? "" : "s"} seen)`,
    ].filter(Boolean).join(" · ");
    return (
      <tr key={key + ":panel"} style={{ cursor: "default" }}><td colSpan={colSpan} className="dock-panel">
        <div className="dock-panel-h">
          <div><b>{f.name}</b><span className="small"> · {f.city}, {f.state}{f.shipper && f.shipper !== f.name ? ` · freight owner on paper: ${f.shipper}` : ""}{f.type === "3pl" ? " · third-party warehouse" : ""}</span>
            <div className="small">{facts} · {dk?.standing === "hold" ? <span className="tag t-flag">BROKER HOLD</span> : dk?.standing === "clear" ? <span className="tag t-ver">NO BROKER HOLD</span> : <span className="tag t-obs">NO OBSERVATIONS YET</span>}</div></div>
          <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setOpen(null)}>Close</button>
        </div>
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h4 style={{ fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 500 }}>People in freight roles · {ps.length}</h4>
              <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} disabled={busy === `disc:${fid}` || !me?.features.providers.includes("peopledatalabs")} onClick={() => discover(fid)} title={f.discoveredAt ? `Last looked up ${new Date(f.discoveredAt).toLocaleDateString()}` : ""}>{busy === `disc:${fid}` ? <><span className="spin" />Looking…</> : f.discoveredAt ? "Look again" : "Find contacts · free"}</button>
            </div>
            {!me?.features.providers.includes("peopledatalabs") && <p className="hint" style={{ color: "var(--red)" }}>People lookup needs a People Data Labs key on the server.</p>}
            {!ps.length && <p className="hint">{f.discoveredAt ? "No one in a freight role on file for this company." : "Nobody looked yet. Finding contacts is free; you pay only for a name, email or phone you choose to see."}</p>}
            {ps.map((p) => (
              <div key={p.id} className="person">
                <div className="person-h"><b>{p.name || <span style={{ color: "var(--faint)" }}>Name hidden</span>}</b><span className="small">{p.title || "title unknown"}</span></div>
                <div className="person-f">
                  {FIELDS.map(([k, label]) => {
                    const v = p[k]; const key = `${p.id}:${k}`;
                    if (v) return <span key={k} className="pf">{k === "linkedin" ? <a className="lnk" href={v} target="_blank" rel="noreferrer">LinkedIn</a> : k === "email" && p.emailStatus === "bounced" ? <s>{v}</s> : v}</span>;
                    return <button key={k} className="btn-ghost pf-btn" disabled={busy === key || (k !== "name" && !p.name)} onClick={() => reveal(p.id, k)} title={COST[k] === 0 ? "Included with the name" : p.has[k] ? `On file, ${tok(COST[k])} to see` : `Will be looked up, ${tok(COST[k])} if found`}>{busy === key ? "…" : COST[k] === 0 ? `${label} · free` : `${label} · ${COST[k]}`}</button>;
                  })}
                  {p.email && p.emailStatus !== "bounced" && <button className="btn pf-btn" disabled={busy === `seq:${p.id}`} onClick={() => startOutreach(p.id)}>{busy === `seq:${p.id}` ? "Drafting…" : "Add to outreach"}</button>}
                  {p.email && p.emailStatus !== "bounced" && <a href="#" className="small lnk" onClick={async (e) => { e.preventDefault(); await api("/api/contacts/bounce", { method: "POST", json: { contactId: p.id } }); flash("Marked bounced and refunded."); load(); refresh(); }}>bounced?</a>}
                </div>
              </div>
            ))}
        </div>
      </td></tr>
    );
  }

  const dockCell = (stops: StopRef[], kind: "pickup" | "drop", rowId: string) => (
    <div>
      {stops.map((s, i) => { const fid = s.facilityId; const n = fid ? people(fid).length : 0; const key = `${rowId}:${fid}`; const isOpen = open === key; return (
        <div key={i} className="dock-line">
          {fid ? <a href="#" className={`dock-name${isOpen ? " open" : ""}`} onClick={(e) => { e.preventDefault(); toggle(key); }}><i>{isOpen ? "\u25BE" : "\u25B8"}</i>{nameOf(s)}</a> : <span>{nameOf(s)}</span>}
          <span className="small"> {fid && fac(fid) ? `${fac(fid)!.city}, ${fac(fid)!.state}` : ""}{fid ? (n ? ` · ${n} contact${n === 1 ? "" : "s"}` : "") : ""}</span>
        </div>); })}
      {stops.length > 1 && <div className="small">{stops.length} {kind === "pickup" ? "pickups" : "drops"}</div>}
      {!stops.length && <span className="small">—</span>}
    </div>
  );

  return (
    <>
      <div className="pane-h"><div><h2>Prospects</h2><p>{d ? `${d.loads.length.toLocaleString()} loads · every shipper and receiver on them · ${me ? tok(me.tokens.total) + " available" : ""}` : "Loading…"}</p></div>
        <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" onClick={() => setChip("look")}>Search lookalikes</button></div></div>
      <div className="chips">{([["loads", "Loads", d?.loads.length ?? 0], ["docks", "Docks", d?.receivers.length ?? 0], ["look", "Lookalikes", d?.lookalikes.rows.length ?? 0]] as const).map(([id, label, n]) => <button key={id} className={`chip${chip === id ? " on" : ""}`} onClick={() => setChip(id)}>{label}<i>{n}</i></button>)}</div>
      <p className="excl">Click a shipper or receiver to see what we know about the dock and who works there. Finding people is free; each name, email or phone is one token.</p>

      {chip === "loads" && (
        <div className="lv" style={{ overflow: "visible" }}>
          <div className="lv-tools"><input className="lv-search" type="text" placeholder="Search shipper, receiver, broker, lane or load number" value={q} onChange={(e) => { setQ(e.target.value); setShow(60); }} /><span className="lv-count">{d ? `${loads.length.toLocaleString()} of ${d.loads.length.toLocaleString()} · ${Math.min(show, loads.length)} shown` : ""}</span></div>
          <table style={{ border: "none" }}><thead><tr><th>Date</th><th>Shipper</th><th>Receiver</th><th>Broker</th><th>Lane</th><th>Equip</th><th className="right">Rate</th></tr></thead><tbody>
            {!d && <tr style={{ cursor: "default" }}><td colSpan={7} className="small">Reading your loads…</td></tr>}
            {d && !loads.length && <tr style={{ cursor: "default" }}><td colSpan={7} className="small">{d.loads.length ? "No loads match that." : "No loads yet. Connect an inbox or upload rate cons under Settings → Sources."}</td></tr>}
            {loads.slice(0, show).flatMap((l) => {
              const row = (
                <tr key={l.id} style={{ cursor: "default" }}>
                  <td className="num" data-label="Date">{l.date || ""}{l.loadNumber ? <div className="small">#{l.loadNumber}</div> : null}{(me?.authorities.length ?? 0) > 1 && <div className="small auth-tag">{me?.authorities.find((a) => a.id === l.authorityId)?.name || l.carrierName || "\u2014"}</div>}</td>
                  <td data-label="Shipper">{dockCell(l.pickups, "pickup", l.id)}</td>
                  <td data-label="Receiver">{dockCell(l.drops, "drop", l.id)}</td>
                  <td data-label="Broker" className="lv-dim">{l.broker || "—"}</td>
                  <td data-label="Lane">{l.lane}<div className="small">{l.commodity || FAM[l.family || ""] || ""}{l.miles ? ` · ${l.miles} mi` : ""}</div></td>
                  <td data-label="Equip" className="lv-dim">{EQ[l.equipment || ""] || "—"}</td>
                  <td data-label="Rate" className="num right">{l.rate ? `$${Math.round(l.rate).toLocaleString()}` : "—"}<div className="small">{l.perMile ? `$${l.perMile.toFixed(2)}/mi` : ""}{l.median && l.perMile && l.perMile < l.median * 0.9 ? <span className="tag t-flag" style={{ marginLeft: 6 }} title={`Your median on this lane is $${l.median.toFixed(2)}/mi`}>LOW</span> : null}</div></td>
                </tr>);
              const openFid = open && open.startsWith(l.id + ":") ? open.slice(l.id.length + 1) : null;
              return openFid ? [row, dockPanel(openFid, 7, open!)] : [row];
            })}
          </tbody></table>
          {loads.length > show && <div className="lv-more"><button className="btn-ghost" onClick={() => setShow(show + 100)}>Load {Math.min(100, loads.length - show)} more · {(loads.length - show).toLocaleString()} left</button></div>}
        </div>
      )}

      {chip === "docks" && (
        <table><thead><tr><th>Dock</th><th>Your loads</th><th>Ships outbound</th><th>Standing</th><th>People</th><th></th></tr></thead><tbody>
          {d && !d.receivers.length && <tr style={{ cursor: "default" }}><td colSpan={6} className="small">No docks yet.</td></tr>}
          {d?.receivers.flatMap((dk) => { const ob = dk.outbound; const n = people(dk.facilityId).length; const row = (
            <tr key={dk.facilityId} onClick={() => setOpen(open === dk.facilityId ? null : dk.facilityId)}>
              <td className="lead">{dk.name}<div className="cell-sub">{dk.city}</div></td>
              <td data-label="Your loads" className="num">{dk.deliveries} in{dk.pickups ? ` · ${dk.pickups} out` : ""}</td>
              <td data-label="Ships outbound">{ob.ok ? `${ob.loadsPerMonth}/mo · ${ob.lanes.map((l) => `${l.dest} ${l.pct}%`).join(" · ")}` : <span className="small">not enough observations</span>}</td>
              <td data-label="Standing">{dk.standing === "clear" ? <span className="tag t-ver">NO BROKER HOLD</span> : <span className="tag t-obs">NO OBSERVATIONS YET</span>}</td>
              <td data-label="People" className="num">{n ? `${n} · ${people(dk.facilityId).filter((p) => p.name).length} named` : "—"}</td>
              <td data-label="" className="right"><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); setOpen(open === dk.facilityId ? null : dk.facilityId); }}>{n ? "People" : "Find contacts"}</button></td></tr>);
            return open === dk.facilityId ? [row, dockPanel(dk.facilityId, 6, dk.facilityId)] : [row]; })}
        </tbody></table>
      )}

      {chip === "look" && (<>
        <div className="panel"><h3>Search lookalikes <span className="tag t-obs" style={{ marginLeft: 6 }}>1 TOKEN PER SHIPPER</span></h3>
          <p className="ph">Starts from what you already haul and looks for docks in the network shipping the same kind of freight. Anything you have hauled for a broker is excluded, and so is anything that broker moves.</p>
          <div className="grid2" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <div className="formrow"><label>Origin state</label><input type="text" placeholder="Any" value={search.state} onChange={(e) => setSearch({ ...search, state: e.target.value.toUpperCase().slice(0, 2) })} /></div>
            <div className="formrow"><label>Equipment</label><select value={search.equipment} onChange={(e) => setSearch({ ...search, equipment: e.target.value })}><option value="">Like mine</option><option value="reefer">Reefer</option><option value="dry_van">Dry van</option><option value="flatbed">Flatbed</option></select></div>
            <div className="formrow"><label>Freight</label><select value={search.family} onChange={(e) => setSearch({ ...search, family: e.target.value })}><option value="">Like mine</option><option value="frozen">Frozen & refrigerated</option><option value="produce">Produce</option><option value="beverage">Beverage</option><option value="dry">Dry</option></select></div>
            <div className="formrow"><label>Min loads / month</label><input type="text" value={search.min} onChange={(e) => setSearch({ ...search, min: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><button className="btn" onClick={estimate}>Estimate cost</button><button className="btn-ghost" onClick={runSearch} disabled={busy === "search" || !unrevealed}>{busy === "search" ? <><span className="spin" />Revealing…</> : `Reveal ${unrevealed ? "all · " + tok(unrevealed) : ""}`}</button><span className="hint" style={{ margin: 0 }}>{est}</span></div>
        </div>
        <table><thead><tr><th>Shipper</th><th>Why it fits</th><th>Outbound</th><th>Equip</th><th>Match</th><th>People</th><th></th></tr></thead><tbody>
          {d && !d.lookalikes.rows.length && <tr style={{ cursor: "default" }}><td colSpan={7} className="small">{d.lookalikes.thin ? "The network has not seen enough freight like yours yet." : "Nothing matches that search."}</td></tr>}
          {d?.lookalikes.rows.flatMap((lk) => { const n = people(lk.facilityId).length; const row = (
            <tr key={lk.facilityId} onClick={() => lk.revealed && setOpen(open === lk.facilityId ? null : lk.facilityId)} style={lk.revealed ? undefined : { cursor: "default" }}>
              <td className="lead">{lk.revealed ? lk.name : <span style={{ color: "var(--faint)" }}>Lookalike shipper</span>}<div className="cell-sub">{lk.city}</div></td>
              <td data-label="Why it fits">Ships {FAM[lk.family || ""] || lk.family || "freight"} on {EQ[lk.equipment || ""] || "trailers"}, like your own history. No broker between you.</td>
              <td data-label="Outbound">{lk.loadsPerMonth}/mo observed</td>
              <td data-label="Equip">{EQ[lk.equipment || ""] || "—"}</td>
              <td data-label="Match"><span className={`tag ${lk.match === "VERIFIED" ? "t-ver" : "t-obs"}`}>{lk.match}</span></td>
              <td data-label="People" className="num">{lk.revealed && n ? `${n}` : "—"}</td>
              <td data-label="" className="right">{lk.revealed ? <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); setOpen(open === lk.facilityId ? null : lk.facilityId); }}>{n ? "People" : "Find contacts"}</button> : <span className="small">1 token to reveal</span>}</td></tr>);
            return open === lk.facilityId ? [row, dockPanel(lk.facilityId, 7, lk.facilityId)] : [row]; })}
        </tbody></table>
      </>)}
    </>
  );
}
