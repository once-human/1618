/**
 * "Here right now: you, two people in Berlin and someone in Mumbai."
 * Towns come from each visitor's connection, at city level.
 */
export interface Town {
  city: string | null;
  country: string | null;
}

const NUM = ["no one", "someone", "two people", "three people", "four people", "five people"];
const count = (n: number) => NUM[n] ?? `${n} people`;

function list(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** `name` turns a town into words ("Berlin, Germany"); injected so this stays testable. */
export function whoIsHere(
  others: Town[],
  mine: Town,
  name: (t: Town) => string,
  { people, myTabs = 1 }: { people: number; myTabs?: number },
): string {
  const tabs = myTabs > 1 ? `, in ${myTabs} tabs` : "";
  if (people <= 1 || !others.length) return people <= 1 ? `Just you here right now${tabs}.` : `${people} people here right now, you included.`;

  // Group by town, biggest first; people in my own town are "someone else in Pune".
  const groups = new Map<string, { label: string; n: number; same: boolean }>();
  for (const o of others) {
    const known = !!(o.city || o.country);
    const k = known ? `${o.city ?? ""}|${o.country ?? ""}` : "?";
    const same = known && o.city === mine.city && o.country === mine.country;
    const g = groups.get(k) ?? { label: known ? name(o) : "", n: 0, same };
    g.n++;
    groups.set(k, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.n - a.n);
  const phrase = (g: { label: string; n: number; same: boolean }) =>
    !g.label ? (g.n === 1 ? "someone" : count(g.n)) : `${g.n === 1 ? (g.same ? "someone else" : "someone") : count(g.n)} in ${g.same ? (mine.city ?? g.label) : g.label}`;

  // Past a handful of places, name the biggest and summarise the rest.
  if (sorted.length > 4) {
    const named = sorted.slice(0, 3).map((g) => g.label || "somewhere");
    return `You and ${others.length} others here right now, from ${named.join(", ")} and ${sorted.length - 3} more places.`;
  }
  const parts = sorted.map(phrase);
  return parts.length === 1 ? `Here right now: you and ${parts[0]}.` : `Here right now: you, ${list(parts)}.`;
}
