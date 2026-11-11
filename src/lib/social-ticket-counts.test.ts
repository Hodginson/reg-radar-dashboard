import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addedSocialTicketQuantity } from "./social-ticket-counts";

describe("Melbourne dinner added tickets", () => {
  const dinner = (tickets: number | null, paymentStatus: string) => ({
    tickets,
    function: { name: "Melbourne Symposium Dinner - Elará Melbourne" },
    paymentDetails: { paymentStatus },
  });

  test("excludes package-included dinners and counts only added tickets", () => {
    const records = [
      ...Array.from({ length: 148 }, () => dinner(1, "INCLUSIVE")),
      ...Array.from({ length: 11 }, () => dinner(1, "PURCHASE")),
      dinner(1, "COMPLIMENTARY"),
      ...Array.from({ length: 2 }, () => dinner(1, "CHARGE_TO_ANOTHER_CONTACT")),
      dinner(2, "PURCHASE"),
      ...Array.from({ length: 6 }, () => dinner(1, "GUEST_OF")),
      dinner(0, "PURCHASE"),
      dinner(null, "PURCHASE"),
    ];
    assert.equal(records.reduce((sum, row) => sum + addedSocialTicketQuantity(row), 0), 22);
    assert.equal(records.filter((row) => addedSocialTicketQuantity(row) > 0).length, 21);
  });

  test("preserves package inclusions for other social events", () => {
    assert.equal(addedSocialTicketQuantity({
      tickets: 1,
      function: { name: "Christchurch Symposium Dinner" },
      paymentDetails: { paymentStatus: "INCLUSIVE" },
    }), 1);
  });
});