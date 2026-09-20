import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { unseal } from "@/lib/crypto";
import { graphSend } from "./graph";

/* Sends go out as the carrier, from their own mailbox: Gmail SMTP with the
   same app password, or Microsoft Graph for Outlook. Never from us. */
export async function sendAs(mailboxId: string, msg: { to: string; subject: string; text: string; inReplyTo?: string; references?: string }) {
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId));
  if (!mb?.secret) throw new Error("No sending mailbox connected.");
  if (mb.kind === "microsoft") return graphSend(mb, msg);
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: mb.address, pass: unseal(mb.secret) }, connectionTimeout: 15_000, greetingTimeout: 15_000 });
  const info = await t.sendMail({ from: mb.address, to: msg.to, subject: msg.subject, text: msg.text, inReplyTo: msg.inReplyTo, references: msg.references });
  return { messageId: info.messageId as string };
}
