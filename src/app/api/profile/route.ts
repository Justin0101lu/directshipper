import { json, withSession } from "@/lib/api";
import { computeProfile } from "@/lib/freight/profile";
export const GET = withSession(async (_req, s) => json(await computeProfile(s.aid)));
