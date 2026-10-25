import { test } from "node:test";
import assert from "node:assert/strict";
import { botName, cleanPath, isTerminal, refHost } from "./visits/shared";

test("programs get a readable name", () => {
  assert.equal(botName("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), "Googlebot");
  assert.equal(botName("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"), "Facebook / Instagram preview");
  assert.equal(botName("curl/8.5.0"), "curl");
  assert.equal(botName("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)"), "Anthropic");
  assert.equal(botName(""), "No user agent");
  assert.ok(isTerminal("curl") && !isTerminal("Googlebot"));
});

test("only a site name is kept from where someone came from", () => {
  assert.equal(refHost("https://l.instagram.com/?u=https%3A%2F%2Fonkaryaglewad.in%2F&e=secret"), "instagram.com");
  assert.equal(refHost("https://www.google.com/search?q=onkar"), "google.com");
  assert.equal(refHost("https://www.onkaryaglewad.in/now", "www.onkaryaglewad.in"), null);
  assert.equal(refHost("not a url"), null);
});

test("paths lose their query strings", () => {
  assert.equal(cleanPath("/talk?x=1#abc"), "/talk");
  assert.equal(cleanPath(""), "/");
});
