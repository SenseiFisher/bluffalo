import * as fs from "fs";
import * as path from "path";
import { Fact, PersonalQuestionTemplate } from "../../../../../shared/types";

const factsCacheByLang = new Map<string, Fact[]>();

export function loadFacts(lang: string = "en"): Fact[] {
  if (factsCacheByLang.has(lang)) return factsCacheByLang.get(lang)!;

  // Resolve facts path — works for both ts-node-dev (src/) and compiled (dist/) layouts
  // In dist: __dirname = server/dist/server/src/games/bluffalo/content/ — 7 levels up to project root
  // In src:  __dirname = server/src/games/bluffalo/content/             — 5 levels up to project root
  const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
  const levelsUp = isDist ? "../../../../../../../" : "../../../../../";

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

const pqCacheByLang = new Map<string, PersonalQuestionTemplate[]>();

export function loadPersonalQuestions(lang: string = "en"): PersonalQuestionTemplate[] {
  if (pqCacheByLang.has(lang)) return pqCacheByLang.get(lang)!;

  const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
  const levelsUp = isDist ? "../../../../../../../" : "../../../../../";

  const filename = lang === "en"
    ? "personal_questions.en.json"
    : `personal_questions.${lang}.json`;
  const filePath = path.resolve(__dirname, levelsUp, "content", filename);

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as PersonalQuestionTemplate[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${filename} must be a non-empty array`);
  }

  for (const pq of data) {
    if (!pq.content_id || !pq.fact_template) {
      throw new Error(`Invalid personal question: ${JSON.stringify(pq)}`);
    }
    if (!pq.fact_template.includes("_______")) {
      throw new Error(`${pq.content_id} missing blank placeholder`);
    }
    if (!pq.fact_template.includes("[Name]")) {
      throw new Error(`${pq.content_id} missing [Name] placeholder`);
    }
  }

  pqCacheByLang.set(lang, data);
  return data;
}

export function getRandomPersonalQuestion(usedIds: string[], lang: string = "en"): PersonalQuestionTemplate | null {
  const templates = loadPersonalQuestions(lang);
  const available = templates.filter((t) => !usedIds.includes(t.content_id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function buildPersonalQuestionFact(template: PersonalQuestionTemplate, subjectName: string): Fact {
  return {
    content_id: template.content_id,
    fact_template: template.fact_template.replace("[Name]", subjectName),
    truth_keyword: "", // filled in by advanceToReveal from subject's submitted_lie
    metadata: { difficulty: "Easy", category: template.metadata.category },
  };
}
