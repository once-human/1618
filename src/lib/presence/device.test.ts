import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceKey, networkOf, screenOf } from "./device";

const base = {
  ip: "203.0.113.7",
  os: "ios" as const,
  screen: "2532x1170",
  day: "2026-10-17",
  secret: "s",
};

test("every browser on one device gets the same key", () => {
  assert.equal(deviceKey(base), deviceKey({ ...base }));
});

test("a different device, network or day gets a different key", () => {
  assert.notEqual(deviceKey(base), deviceKey({ ...base, screen: "2796x1290" }));
  assert.notEqual(deviceKey(base), deviceKey({ ...base, os: "android" }));
  assert.notEqual(deviceKey(base), deviceKey({ ...base, ip: "203.0.113.8" }));
  assert.notEqual(deviceKey(base), deviceKey({ ...base, day: "2026-10-18" }));
});

test("keys fit the realtime id format", () => {
  assert.match(deviceKey(base), /^[a-f0-9]{24}$/);
});

test("IPv6 addresses on one network share a /64, however they're written", () => {
  assert.equal(networkOf("2401:4900:1c2a:5f00:a1b2:c3d4:e5f6:1"), "2401:4900:1c2a:5f00");
  assert.equal(networkOf("2401:4900:1c2a:5f00::99"), "2401:4900:1c2a:5f00");
  assert.equal(networkOf("2401:4900:0:5f00::1"), "2401:4900:0:5f00");
  assert.equal(networkOf("2401:4900::1"), "2401:4900:0:0");
  assert.equal(networkOf("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(networkOf(" 203.0.113.7 "), "203.0.113.7");
});

test("screen size ignores rotation and rejects nonsense", () => {
  assert.equal(screenOf(1170, 2532), "2532x1170");
  assert.equal(screenOf(2532.4, 1170), "2532x1170");
  assert.equal(screenOf("abc", 10), null);
  assert.equal(screenOf(5, 5), null);
});
