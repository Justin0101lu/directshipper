import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@electric-sql/pglite",
    "imapflow",
    "nodemailer",
    "mailparser",
    "postgres",
    "pdf-parse",
  ],
};

export default nextConfig;
