"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "./api";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const r = useRouter();
  const [f, setF] = useState({ company: "", email: "", password: "", mc: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api(`/api/auth/${mode}`, { method: "POST", json: f }); r.push(mode === "signup" ? "/onboard" : "/app"); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="view on">
      <div className="topbar"><div className="topbar-in"><Link className="logo" href="/"><b></b>Direct Shipper</Link></div></div>
      <form className="auth" onSubmit={go}>
        <h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
        <p>{mode === "signup" ? "You connect your inbox on the next screen." : "Welcome back."}</p>
        {mode === "signup" && <div className="formrow"><label htmlFor="co">Company name</label><input id="co" type="text" placeholder="Ruiz Trucking LLC" value={f.company} onChange={set("company")} required /></div>}
        <div className="formrow"><label htmlFor="em">Work email</label><input id="em" type="email" placeholder="you@company.com" value={f.email} onChange={set("email")} required /></div>
        <div className="formrow"><label htmlFor="pw">Password</label><input id="pw" type="password" placeholder="At least 8 characters" value={f.password} onChange={set("password")} required minLength={8} /></div>
        {mode === "signup" && <div className="formrow"><label htmlFor="mc">MC number <span style={{ color: "var(--faint)" }}>(optional)</span></label><input id="mc" type="text" placeholder="884213" value={f.mc} onChange={set("mc")} /></div>}
        {err && <p className="err on">{err}</p>}
        <button className="btn btn-lg" style={{ width: "100%", marginTop: 8 }} disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}</button>
        <p className="hint" style={{ textAlign: "center", marginTop: 16 }}>
          {mode === "signup" ? <>Already set up? <Link href="/signin" style={{ color: "var(--blue)" }}>Sign in</Link></> : <>New here? <Link href="/signup" style={{ color: "var(--blue)" }}>Start free</Link></>}
        </p>
      </form>
    </div>
  );
}
