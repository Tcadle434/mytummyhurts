import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { isEntitledSubscriptionStatus } from "./entitlements.ts";

Deno.test("isEntitledSubscriptionStatus only allows verified access statuses", () => {
  assertEquals(isEntitledSubscriptionStatus("trialing"), true);
  assertEquals(isEntitledSubscriptionStatus("active"), true);
  assertEquals(isEntitledSubscriptionStatus("in_grace"), true);
  assertEquals(isEntitledSubscriptionStatus("none"), false);
  assertEquals(isEntitledSubscriptionStatus("expired"), false);
  assertEquals(isEntitledSubscriptionStatus("canceled"), false);
  assertEquals(isEntitledSubscriptionStatus(undefined), false);
});
