/** Melbourne dinner sales include package tickets, but not duplicate guest-of entries. */
export function addedSocialTicketQuantity(record: {
  tickets?: number | null;
  function?: { name?: string | null } | null;
  paymentDetails?: { paymentStatus?: string | null } | null;
}): number {
  const name = record.function?.name ?? "";
  const isMelbourneDinner = /melbourne/i.test(name) && /dinner/i.test(name);
  if (!isMelbourneDinner) return record.tickets ?? 1;
  if (record.paymentDetails?.paymentStatus?.toUpperCase() === "GUEST_OF") return 0;
  return Math.max(0, record.tickets ?? 0);
}