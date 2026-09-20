import { body, fail, json, withSession } from "@/lib/api";
import { lookalikes, revealLookalike } from "@/lib/freight/prospects";
import { spend } from "@/lib/tokens";
/* Reveal lookalikes: 1 token per shipper, charged only for the rows we actually have. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ state?: string; equipment?: string; family?: string; min?: number; estimate?: boolean }>(req);
  const look = await lookalikes(s.aid, { originState: b.state, equipment: b.equipment, family: b.family, minPerMonth: b.min });
  const unrevealed = look.rows.filter((r) => !r.revealed);
  if (b.estimate) return json({ count: unrevealed.length, excluded: look.excluded, thin: look.thin, family: look.family, equipment: look.equipment });
  if (!unrevealed.length) return fail(look.thin ? "The network has not seen enough freight like yours yet. Every rate con you add moves it forward, and so does every other carrier's." : "Nothing new to reveal for that search.");
  await spend(s.aid, unrevealed.length, `${unrevealed.length} lookalike shippers — ${look.family} ${look.equipment}${b.state ? " from " + b.state : ""}`);
  for (const r of unrevealed) await revealLookalike(s.aid, r.facilityId);
  return json({ revealed: unrevealed.length });
});
