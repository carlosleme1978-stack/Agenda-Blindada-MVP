import crypto from "crypto";

export function verifyMetaSignature(rawBody: string, headerSig: string | null) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new Error("META_APP_SECRET missing");

  if (!headerSig) return false;

  // "sha256=..."
  const [algo, sig] = headerSig.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
