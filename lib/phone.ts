export function stripPhoneToDigits(input: string | null | undefined) {
  return String(input ?? "").replace(/\D/g, "");
}

export function normalizePhoneE164(input: string | null | undefined) {
  const original = String(input ?? "").trim();

  if (!original) return null;

  const hadPlus = original.startsWith("+");
  let digits = stripPhoneToDigits(original);

  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Preserve the current project behavior for Brazilian local numbers.
  if (!hadPlus && (digits.length === 10 || digits.length === 11)) {
    return `+55${digits}`;
  }

  // WhatsApp usually sends wa_id with country code and no plus.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Fallback for already international numbers inside E.164 length limits.
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}
