import { test } from "node:test";
import assert from "node:assert/strict";
import { whoIsHere, type Town } from "./words";

const name = (t: Town) => [t.city, t.country].filter(Boolean).join(", ");
const pune = { city: "Pune", country: "IN" };
const berlin = { city: "Berlin", country: "DE" };
const mumbai = { city: "Mumbai", country: "IN" };

test("alone", () => {
  assert.equal(whoIsHere([], pune, name, { people: 1 }), "Just you here right now.");
  assert.equal(whoIsHere([], pune, name, { people: 1, myTabs: 3 }), "Just you here right now, in 3 tabs.");
});

test("one other person", () => {
  assert.equal(whoIsHere([berlin], pune, name, { people: 2 }), "Here right now: you and someone in Berlin, DE.");
});

test("someone in my own town", () => {
  assert.equal(whoIsHere([pune], pune, name, { people: 2 }), "Here right now: you and someone else in Pune.");
});

test("several, grouped by town", () => {
  assert.equal(
    whoIsHere([berlin, mumbai, berlin], pune, name, { people: 4 }),
    "Here right now: you, two people in Berlin, DE and someone in Mumbai, IN.",
  );
});

test("unknown towns", () => {
  assert.equal(whoIsHere([{ city: null, country: null }], pune, name, { people: 2 }), "Here right now: you and someone.");
});

test("many places are summarised", () => {
  const towns = ["A", "B", "C", "D", "E"].map((c) => ({ city: c, country: "XX" }));
  assert.equal(whoIsHere(towns, pune, name, { people: 6 }), "You and 5 others here right now, from A, XX, B, XX, C, XX and 2 more places.");
});
