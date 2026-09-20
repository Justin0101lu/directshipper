"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
type Ctx = { flash: (msg: string, kind?: "ok" | "err") => void };
const C = createContext<Ctx>({ flash: () => {} });
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setM({ msg, kind });
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setM(null), 6000);
  }, []);
  return <C.Provider value={{ flash }}>{m && <div className={`flash on${m.kind === "err" ? " err" : ""}`}>{m.msg}</div>}{children}</C.Provider>;
}
export const useFlash = () => useContext(C);
