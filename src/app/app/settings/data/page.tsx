"use client";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export default function Data() {
  const r = useRouter();
  async function del() {
    if (!confirm("Delete every load, contact, sequence and mailbox on this account? This cannot be undone.")) return;
    await api("/api/account", { method: "DELETE" }); r.push("/");
  }
  return (
    <>
      <div className="pane-h"><div><h2>Your data</h2><p>What is kept, what is shared, and how to delete it</p></div></div>
      <div className="panel" id="data">
        <p className="ph">Your rates and broker names are never shown to another customer, and Direct Shipper never surfaces a shipper to anyone because you hauled it for their broker. Delete everything and your freight stops counting toward aggregate figures immediately.</p>
        <button className="btn-ghost" onClick={del}>Delete my data</button></div>
    </>
  );
}
