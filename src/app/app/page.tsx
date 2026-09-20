"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tok } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";

type Contact = { id: string; name: string | null; title: string | null; linkedin: string | null; email: string | null; emailStatus: string | null; phone: string | null };
type Outbound = { ok: true; loadsPerMonth: number; accounts: number; lanes: { dest: string; pct: number }[]; equipment: string | null; family: string | null } | { ok: false; accounts: number };
type Receiver = { facilityId: string; name: string; city: string; deliveries: number; outbound: Outbound; standing: string; why: string; contactId: string | null };
type Look = { facilityId: string; name: string; city: string; family: string | null; equipment: string | null; loadsPerMonth: number; match: string; revealed: boolean; contactId: string | null };
type Data = { receivers: Receiver[]; lookalikes: { family: string; equipment: string; rows: Look[]; excluded: number; thin: boolean }; contacts: Record<string, Contact> };

const FIELDS = [["name", "Name and job title"], ["linkedin", "LinkedIn profile"], ["email", "Verified email"], ["phone", "Direct phone"]] as const;
const EQ: Record<string, string> = { reefer: "Reefer", dry_van: "Dry van", flatbed: "Flatbed" };
const FAM: Record<string, string> = { frozen: "Frozen & refrigerated", produce: "Produce", beverage: "Beverage", dry: "Dry" };

export default function Prospects() {
  const { me, refresh } = useMe(); const { flash } = useFlash(); const r = useRouter();
  const [d, setD] = useState<Data | null>(null); const [chip, setChip] = useState<"all" | "recv" | "look">("all");
  const [open, setOpen] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState({ state: "", equipment: "", family: "", min: "4" }); const [est, setEst] = useState<string>("");
  const load = useCallback(() => api<Data>(`/api/prospects?${new URLSearchParams(Object.fromEntries(Object.entries(search).filter(([, v]) => v)))}`).then(setD).catch((e) => flash(e.message, "err")), [search, flash]);
  useEffect(() => { load(); }, [load]);

  async function reveal(facilityId: string, field: string) {
    setBusy(`${facilityId}:${field}`);
    try { const x = await api<{ found: boolean; value: string | null }>("/api/contacts/reveal", { method: "POST", json: { facilityId, field } });
      flash(x.found ? `Found. 1 token.` : "Nothing found. Nothing charged."); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/billing"); }
    finally { setBusy(null); }
  }
  async function estimate() {
    try { const x = await api<{ count: number; excluded: number; thin: boolean; family: string; equipment: string }>("/api/prospects/lookalikes", { method: "POST", json: { ...search, min: Number(search.min), estimate: true } });
      setEst(x.thin ? "The network has not seen enough freight like yours yet. Every rate con you add moves it forward." : `${x.count} new lookalike${x.count === 1 ? "" : "s"} match (${FAM[x.family] || x.family}, ${EQ[x.equipment] || x.equipment}). One token each = ${tok(x.count)}. ${x.excluded} excluded as broker relationships. Nothing charged yet.`); }
    catch (e) { flash((e as Error).message, "err"); }
  }
  async function runSearch() {
    setBusy("search");
    try { const x = await api<{ revealed: number }>("/api/prospects/lookalikes", { method: "POST", json: { ...search, min: Number(search.min) } }); flash(`${x.revealed} lookalikes revealed for ${tok(x.revealed)}.`); setEst(""); await load(); refresh(); }
    catch (e) { const err = e as Error & { status?: number }; flash(err.message, "err"); if (err.status === 402) r.push("/app/billing"); }
    finally { setBusy(null); }
  }
  async function startOutreach(contactId: string) {
    setBusy(`seq:${contactId}`);
    try { await api("/api/outreach/start", { method: "POST", json: { contactId } }); flash("Sequence drafted. Approve the opener under Outreach."); r.push("/app/outreach"); }
    catch (e) { flash((e as Error).message, "err"); } finally { setBusy(null); }
  }

  const recvRows = d?.receivers ?? [], lookRows = d?.lookalikes.rows ?? [];
  const count = recvRows.length + lookRows.length;
  const rows = chip === "recv" ? recvRows.map((x) => ({ kind: "recv" as const, x })) : chip === "look" ? lookRows.map((x) => ({ kind: "look" as const, x })) : [...recvRows.map((x) => ({ kind: "recv" as const, x })), ...lookRows.map((x) => ({ kind: "look" as const, x }))];
  const unrevealed = lookRows.filter((x) => !x.revealed).length;

  function contactBlock(facilityId: string) {
    const c = d?.contacts[facilityId];
    return (
      <tr key={facilityId + ":c"} style={{ cursor: "default" }}><td colSpan={7} style={{ background: "var(--sunk)" }}>
        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div><h4 style={{ fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 500, marginBottom: 8 }}>Who to call</h4>
            {!me?.features.providers.length && <p className="hint" style={{ color: "var(--red)" }}>No contact provider is configured yet (Findymail or People Data Labs key).</p>}
            <dl>{FIELDS.map(([k, label]) => { const v = c?.[k]; const key = `${facilityId}:${k}`; return (
              <div className="row" key={k}><dt>{label}</dt><dd>{v ? (k === "linkedin" ? <a href={v} target="_blank" rel="noreferrer" className="lnk">{v.replace(/^https?:\/\//, "")}</a> : k === "email" && c?.emailStatus === "bounced" ? <s>{v}</s> : k === "name" ? `${v}${c?.title ? " — " + c.title : ""}` : v)
                : <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} disabled={busy === key || (k !== "name" && !c?.name)} onClick={() => reveal(facilityId, k)}>{busy === key ? <><span className="spin" />Looking…</> : "Reveal · 1 token"}</button>}</dd></div>); })}</dl>
            <p className="hint">One token per field, charged only on a verified result. Reveal the name first. {c?.email && c.emailStatus !== "bounced" && <a href="#" className="lnk" onClick={async (e) => { e.preventDefault(); await api("/api/contacts/bounce", { method: "POST", json: { contactId: c.id } }); flash("Marked bounced and refunded."); load(); refresh(); }}>Email bounced? Refund it.</a>}</p></div>
          <div><h4 style={{ fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 500, marginBottom: 8 }}>Next</h4>
            <p className="hint" style={{ marginTop: 0 }}>{c?.email ? "Email on file. Draft the seven-touch sequence; you approve the opener before anything sends." : "Reveal a verified email, then add them to outreach."}</p>
            <button className="btn" disabled={!c?.email || busy === `seq:${c?.id}`} onClick={() => c && startOutreach(c.id)}>{busy === `seq:${c?.id}` ? <><span className="spin" />Drafting…</> : "Add to outreach"}</button></div>
        </div></td></tr>
    );
  }

  return (
    <>
      <div className="pane-h"><div><h2>Prospects</h2><p>{d ? `${count} shippers you could win, warmest first · ${me ? tok(me.tokens.total) + " available" : ""}` : "Loading…"}</p></div>
        <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" onClick={() => setChip("look")}>Search lookalikes</button></div></div>
      <div className="chips">{([["all", "All", count], ["recv", "Receivers", recvRows.length], ["look", "Lookalikes", lookRows.length]] as const).map(([id, label, n]) => <button key={id} className={`chip${chip === id ? " on" : ""}`} onClick={() => setChip(id)}>{label}<i>{n}</i></button>)}</div>
      <p className="excl">Shippers you reach through a current broker are hidden.{d && d.lookalikes.excluded ? ` ${d.lookalikes.excluded} lookalikes excluded as existing broker relationships.` : ""}</p>

      {chip === "look" && (
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
      )}

      <table><thead><tr><th>Shipper</th><th>Why it fits</th><th>Their outbound</th><th>Equip</th><th>Standing</th><th>Cost</th><th></th></tr></thead><tbody>
        {!d && <tr style={{ cursor: "default" }}><td colSpan={7} style={{ color: "var(--faint)" }}>Reading your loads…</td></tr>}
        {d && !rows.length && <tr style={{ cursor: "default" }}><td colSpan={7} style={{ color: "var(--faint)" }}>{recvRows.length === 0 ? "No loads yet. Connect an inbox or upload rate cons under Account → Sources, and the docks you deliver to appear here." : "Nothing under this chip."}</td></tr>}
        {d && rows.flatMap(({ kind, x }) => {
          const c = d.contacts[x.facilityId];
          const main = kind === "recv" ? (() => { const rr = x as Receiver; const ob = rr.outbound; return (
            <tr key={rr.facilityId} onClick={() => setOpen(open === rr.facilityId ? null : rr.facilityId)}>
              <td className="lead">{rr.name}<div className="cell-sub">{rr.city} · {rr.deliveries} deliveries</div></td>
              <td data-label="Why it fits">{rr.why}</td>
              <td data-label="Their outbound">{ob.ok ? `${ob.loadsPerMonth}/mo${ob.lanes[0] ? " · " + ob.lanes.map((l) => `${l.dest} ${l.pct}%`).join(" · ") : ""}` : <span className="hint" style={{ margin: 0 }}>Not enough observations ({ob.accounts} carrier{ob.accounts === 1 ? "" : "s"})</span>}</td>
              <td data-label="Equip">{ob.ok && ob.equipment ? EQ[ob.equipment] || ob.equipment : "—"}</td>
              <td data-label="Standing">{rr.standing === "clear" ? <span className="tag t-ver">NO BROKER HOLD</span> : rr.standing === "thin" ? <span className="tag t-obs">THIN VOLUME</span> : <span className="tag t-inf">INBOUND ONLY</span>}</td>
              <td data-label="Cost" className="num">{c?.email ? <span className="tag t-ver">CONTACT ON FILE</span> : <span className="pill">FREE</span>}</td>
              <td data-label="" className="right"><button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); setOpen(open === rr.facilityId ? null : rr.facilityId); }}>{c?.name ? "Contact" : "Get contact"}</button></td></tr>); })()
          : (() => { const lk = x as Look; return (
            <tr key={lk.facilityId} onClick={() => lk.revealed && setOpen(open === lk.facilityId ? null : lk.facilityId)} style={lk.revealed ? undefined : { cursor: "default" }}>
              <td className="lead">{lk.revealed ? lk.name : <span style={{ color: "var(--faint)" }}>Lookalike shipper</span>}<div className="cell-sub">{lk.city}</div></td>
              <td data-label="Why it fits">Ships {FAM[lk.family || ""] || lk.family || "freight"} on {EQ[lk.equipment || ""] || "trailers"}, like your own history. No broker between you.</td>
              <td data-label="Their outbound">{lk.loadsPerMonth}/mo observed</td>
              <td data-label="Equip">{EQ[lk.equipment || ""] || "—"}</td>
              <td data-label="Standing"><span className={`tag ${lk.match === "VERIFIED" ? "t-ver" : "t-obs"}`}>{lk.match}</span></td>
              <td data-label="Cost" className="num">{lk.revealed ? <>1 token<div className="cell-sub">spent</div></> : <>1 token<div className="cell-sub">to reveal</div></>}</td>
              <td data-label="" className="right">{lk.revealed ? <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); setOpen(open === lk.facilityId ? null : lk.facilityId); }}>{c?.name ? "Contact" : "Get contact"}</button> : <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }} onClick={() => setChip("look")}>Reveal</button>}</td></tr>); })();
          return open === x.facilityId ? [main, contactBlock(x.facilityId)] : [main];
        })}
      </tbody></table>
      {chip === "recv" && (
        <div className="grid2" style={{ marginTop: 20 }}>
          <div className="panel"><h3>Why receivers come first</h3><p className="ph" style={{ margin: 0 }}>A broker&rsquo;s non-solicit covers the broker&rsquo;s customer, the shipper who tendered the load. The consignee on the delivery end is usually not that customer, and their outbound freight is their own to award. You are also the only carrier who can say &ldquo;I&rsquo;m at your dock Thursday anyway.&rdquo; A few agreements reach consignees too; read yours.</p></div>
          <div className="panel"><h3>Where the outbound number comes from</h3><p className="ph" style={{ margin: 0 }}>Other carriers&rsquo; rate cons that show this dock as the pickup. A figure is published only once at least three unrelated carriers have seen it, so nobody&rsquo;s loads can be traced back. Below that, you see &ldquo;not enough observations&rdquo; instead of a guess.</p></div>
        </div>
      )}
    </>
  );
}
