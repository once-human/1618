import { test } from "node:test";
import assert from "node:assert/strict";
import { Roster } from "./roster";

const ME = "browserMe";
let NOW = 0;

test("tabs in one browser are one person", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1", "t2", "t3"], other: ["o1"] }, NOW);
  assert.deepEqual(r.count(0), { people: 2, tabs: 4, mine: 3 });
});

test("a hi counts straight away, before presence catches up", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"] }, NOW);
  r.hi("n1", "newcomer", 0);
  assert.deepEqual(r.count(1), { people: 2, tabs: 2, mine: 1 });
  r.sync({ [ME]: ["t1"], newcomer: ["n1"] }, (NOW = 2));
  assert.deepEqual(r.count(2), { people: 2, tabs: 2, mine: 1 });
});

test("a hi that presence never confirms is forgotten", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"] }, NOW);
  r.hi("x1", "ghost", 0);
  assert.equal(r.count(7_999).people, 2);
  assert.equal(r.count(8_000).people, 1);
});

test("closing one of several tabs drops the tab at once, not the person", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1", "o2"] }, NOW);
  r.bye("o2", 0);
  assert.deepEqual(r.count(0), { people: 2, tabs: 2, mine: 1 });
});

test("a person leaving waits out the reload grace, then goes", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, NOW);
  r.bye("o1", 0);
  assert.equal(r.count(1_000).people, 2);
  assert.equal(r.count(1_500).people, 1);
  assert.equal(r.nextChange(0), 1_500);
});

test("a reload never shows a dip", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, NOW);
  r.bye("o1", 0);
  r.hi("o2", "other", 300);
  for (const at of [0, 300, 1_000, 1_500, 2_000]) assert.equal(r.count(at).people, 2, `at ${at}ms`);
  r.sync({ [ME]: ["t1"], other: ["o2"] }, (NOW = 2_600));
  assert.deepEqual(r.count(2_600), { people: 2, tabs: 2, mine: 1 });
});

test("presence wins when a bye was never sent, after the reload grace", () => {
  NOW = 0;
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1", "o2"] }, 0);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, 10);
  assert.equal(r.count(10).tabs, 2, "a tab that isn't someone's last goes at once");
  r.sync({ [ME]: ["t1"] }, 20);
  assert.equal(r.count(20).people, 2);
  assert.equal(r.count(1_520).people, 1);
});

test("presence dropping a reloading tab before its hi shows no dip", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, 0);
  r.bye("o1", 0);
  r.sync({ [ME]: ["t1"] }, 8);
  r.hi("o1", "other", 400); // same tab id after a reload
  for (const at of [8, 400, 1_500, 3_000]) assert.equal(r.count(at).people, 2, `at ${at}ms`);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, 2_900);
  assert.deepEqual(r.count(9_000), { people: 2, tabs: 2, mine: 1 });
});

test("a bye's grace isn't granted twice when presence catches up late", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, 0);
  r.bye("o1", 0);
  r.sync({ [ME]: ["t1"] }, 2_500);
  assert.equal(r.count(2_500).people, 1);
});

test("a lost bye can't hide someone who is still here", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1", "o2"] }, NOW);
  r.bye("o1", 0);
  assert.equal(r.count(100).tabs, 2);
  // presence keeps showing o1 (the bye was wrong or stale): it's back after the hold
  r.sync({ [ME]: ["t1"], other: ["o1", "o2"] }, NOW);
  assert.equal(r.count(8_000).tabs, 3);
});

test("a tab opened and closed before presence noticed leaves no trace", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1"], other: ["o1"] }, NOW);
  r.hi("o2", "other", 0);
  r.bye("o2", 100);
  assert.deepEqual(r.count(100), { people: 2, tabs: 2, mine: 1 });
});

test("people lists each person once", () => {
  const r = new Roster(ME);
  r.sync({ [ME]: ["t1", "t2"], other: ["o1"] }, 0);
  r.hi("n1", "newcomer", 0);
  assert.deepEqual(r.people(1).sort(), [ME, "newcomer", "other"].sort());
});
