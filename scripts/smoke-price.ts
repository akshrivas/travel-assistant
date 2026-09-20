import assert from "node:assert";
import {
  parseBudgetThousandsInput,
  sanitizeStayPrice,
} from "../src/lib/engine/price";

assert.equal(parseBudgetThousandsInput("50"), 50000);
assert.equal(parseBudgetThousandsInput("50000"), 50000);
assert.equal(parseBudgetThousandsInput("60,000"), 60000);

// per-night → stay total
assert.equal(sanitizeStayPrice(8000, { nights: 4, budgetMax: 50000 }).amount, 32000);

// fantasy lakh totals dropped
assert.equal(
  sanitizeStayPrice(6_000_000, { nights: 4, budgetMax: 60000 }).incomplete,
  true,
);

// sane total kept
assert.equal(
  sanitizeStayPrice(45000, { nights: 4, budgetMax: 60000 }).amount,
  45000,
);

console.log("price OK");
