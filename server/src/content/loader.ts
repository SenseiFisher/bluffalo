import * as fs from "fs";
import * as path from "path";
import { Fact } from "../../../shared/types";

let cachedFacts: Fact[] | null = null;

export function loadFacts(): Fact[] {
  if (cachedFacts) return cachedFacts;

  // Resolve facts path — works for both ts-node-dev (src/) and compiled (dist/) layouts
  // In dist: __dirname = server/dist/server/src/content/ — 5 levels up to project root
  // In src:  __dirname = server/src/content/             — 3 levels up to project root
  const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
  const levelsUp = isDist ? "../../../../../" : "../../../";

  const factsPath = process.env.FACTS_PATH
    ? path.resolve(process.env.FACTS_PATH)
    : path.resolve(__dirname, levelsUp, "content/facts.json");

  const raw = fs.readFileSync(factsPath, "utf-8");
  const data = JSON.parse(raw) as Fact[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("facts.json must be a non-empty array");
  }

  // Validate each fact
  for (const fact of data) {
    if (!fact.content_id || !fact.fact_template || !fact.truth_keyword) {
      throw new Error(`Invalid fact: ${JSON.stringify(fact)}`);
    }
    if (!fact.fact_template.includes("_______")) {
      throw new Error(`Fact ${fact.content_id} missing blank placeholder`);
    }
  }

  cachedFacts = data;
  return data;
}

export function getFacts(): Fact[] {
  if (!cachedFacts) {
    return loadFacts();
  }
  return cachedFacts;
}

export function getRandomFact(usedIds: string[]): Fact | null {
  const facts = getFacts();
  const available = facts.filter((f) => !usedIds.includes(f.content_id));
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}
