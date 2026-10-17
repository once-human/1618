import { test } from "node:test";
import assert from "node:assert/strict";
import { artSet, artUrl } from "./art";

const APPLE = "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/e7/09/da/abc/5054197812194.jpg/100x100bb.jpg";

test("small covers stay JPEG, bigger ones switch to WebP (about half the bytes)", () => {
  assert.match(artUrl(APPLE, 96), /\/96x96bb\.jpg$/);
  assert.match(artUrl(APPLE, 176), /\/176x176bb\.webp$/);
  assert.match(artUrl(APPLE, 5000), /\/1200x1200bb\.webp$/);
});

test("1×, 2× and 3× versions for the screen to choose from", () => {
  const s = artSet(APPLE, 48);
  assert.equal(s.srcSet?.split(", ").length, 3);
  assert.match(s.src ?? "", /\/96x96bb\.jpg$/);
});

test("other image hosts are left alone", () => {
  assert.equal(artUrl("https://example.com/a.png", 200), "https://example.com/a.png");
  assert.deepEqual(artSet(null, 48), {});
});
