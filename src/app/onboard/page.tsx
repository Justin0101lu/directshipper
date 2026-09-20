"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { FlashProvider } from "@/components/Flash";
import { MailConnect } from "@/components/MailConnect";
type Me = { forwardAddress: string; features: { microsoft: boolean; ai: boolean } };
export default function Onboard() {
  const r = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/api/me").then(setMe).catch(() => r.push("/signin")); }, [r]);
  return (
    <FlashProvider>
      <div className="view on">
        <div className="topbar"><div className="topbar-in"><div className="logo"><b></b>Direct Shipper</div><nav className="topnav"><span style={{ fontSize: 13 }}>Step 2 of 2</span></nav></div></div>
        <div className="wrap narrow" style={{ paddingTop: 56, paddingBottom: 80 }}>
          <h2 style={{ fontSize: 26, letterSpacing: "-.02em", fontWeight: 600 }}>Connect the inbox your rate cons land in</h2>
          <p style={{ color: "var(--steel)", marginTop: 10, marginBottom: 28 }}>Direct Shipper reads only messages that look like rate confirmations, as far back as your mailbox goes. Your freight profile is on screen about a minute after you connect.</p>
          <MailConnect me={me} onDone={() => r.push("/app/freight")} />
          <p className="hint" style={{ marginTop: 18 }}><Link href="/app" style={{ color: "var(--blue)" }}>Skip for now</Link> and connect later under Account &rarr; Sources.</p>
        </div>
      </div>
    </FlashProvider>
  );
}
