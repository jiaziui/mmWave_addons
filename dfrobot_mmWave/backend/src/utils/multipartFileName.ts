/**
 * Multipart filename encoding helpers.
 *
 * Busboy/multer historically expose Content-Disposition filenames as a binary
 * string decoded as Latin-1. UTF-8 Chinese names then show up as mojibake
 * (e.g. "沙发.png" → "æ²å.png"). Prefer an explicit UTF-8 form field from
 * the client; otherwise attempt Latin-1 → UTF-8 recovery when it looks like
 * mojibake.
 */

const looksLikeMojibake = (value: string): boolean =>
  /[\u00C0-\u00FF]/.test(value) && !/[\u4E00-\u9FFF]/.test(value);

export const decodeMultipartFileName = (raw: string | undefined | null): string => {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "";
  }
  if (!looksLikeMojibake(value)) {
    return value;
  }
  try {
    const decoded = Buffer.from(value, "latin1").toString("utf8");
    // Prefer decoded form when it restores CJK / is free of replacement chars.
    if (decoded.includes("\uFFFD")) {
      return value;
    }
    if (/[\u4E00-\u9FFF]/.test(decoded) || decoded !== value) {
      return decoded;
    }
  } catch {
    // keep original
  }
  return value;
};
