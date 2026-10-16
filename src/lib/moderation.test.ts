import { test } from "node:test";
import assert from "node:assert/strict";
import { moderate } from "./moderation";

const ok = (s: string) => assert.equal(moderate(s).ok, true, `should allow: ${s}`);
const no = (s: string) => assert.equal(moderate(s).ok, false, `should refuse: ${s}`);

test("ordinary messages go up as written", () => {
  ok("love the site, the listening part is so good");
  ok("grapes, cocktails and documents");
  ok("Sussex says hi");
  ok("this is fucking cool"); // swearing in delight is fine
});

test("names and places that contain blocked letters are left alone", () => {
  ok("hello from Niger");
  ok("Nigam from Pune");
  ok("Scott from Dickinson");
});

test("links are refused", () => {
  no("check out www.example.com");
  no("https://spam.example");
  no("buy now at cheap-stuff.shop");
});

test("ascii drawings are refused", () => {
  no("8====D");
  no("( . )( . )");
  no("|||||||||||||||||||||||||||");
});

test("slurs and explicit words are refused, including disguised ones", () => {
  no("you are a d1ck");
  no("c0ck");
  no("f u c k y o u");
});

test("shouting is quietened instead of refused", () => {
  const v = moderate("THIS IS THE BEST SITE EVER");
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.text, "this is the best site ever");
});

test("stretched letters are shortened", () => {
  const v = moderate("soooooooo good");
  assert.equal(v.ok && v.text, "sooo good");
});

test("empty and overly long messages are refused", () => {
  no("   ");
  no("a".repeat(400));
});
