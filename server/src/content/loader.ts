import * as fs from "fs";
import * as path from "path";
import { Fact } from "../../../shared/types";

const factsCacheByLang = new Map<string, Fact[]>();

export function loadFacts(lang: string = "en"): Fact[] {
  if (factsCacheByLang.has(lang)) return factsCacheByLang.get(lang)!;

  // Resolve facts path — works for both ts-node-dev (src/) and compiled (dist/) layouts
  // In dist: __dirname = server/dist/server/src/content/ — 5 levels up to project root
  // In src:  __dirname = server/src/content/             — 3 levels up to project root
  const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
  const levelsUp = isDist ? "../../../../../" : "../../../";

  const filename = lang === "en" ? "facts.json" : `facts.${lang}.json`;
  const factsPath = path.resolve(__dirname, levelsUp, "content", filename);

  const raw = fs.readFileSync(factsPath, "utf-8");
  const data = JSON.parse(raw) as Fact[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${filename} must be a non-empty array`);
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

  factsCacheByLang.set(lang, data);
  return data;
}

export function getRandomFact(usedIds: string[], lang: string = "en"): Fact | null {
  const facts = loadFacts(lang);
  const available = facts.filter((f) => !usedIds.includes(f.content_id));
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}
