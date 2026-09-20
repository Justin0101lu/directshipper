import { getDb } from "./index";
getDb().then(() => { console.log("migrated"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
