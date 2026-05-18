import * as fs from "fs";
import * as path from "path";
import { Fact, PersonalQuestionTemplate, PlaylistEntry } from "../../../../../shared/types";

const factsCacheByLang = new Map<string, Fact[]>();

function resolveContentRoot(): string {
  // In dist: __dirname = server/dist/server/src/games/bluffalo/content/ — 7 levels up to project root
  // In src:  __dirname = server/src/games/bluffalo/content/             — 5 levels up to project root
  const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
  const levelsUp = isDist ? "../../../../../../../" : "../../../../../";
  return path.resolve(__dirname, levelsUp, "content");
}

function langDir(lang: string): string {
  return lang === "en" ? "en" : "heb";
}

function fixTemplate(fact: string, blank: string): string {
  if (fact.includes("_______")) return fact;
  const escaped = blank.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let fixed = fact.replace(new RegExp(`\\[${escaped}\\]`), "_______");
  if (!fixed.includes("_______")) fixed = fact.replace(/\[.+?\]/g, "_______");
  return fixed;
}

export function loadFacts(lang: string = "en"): Fact[] {
  if (factsCacheByLang.has(lang)) return factsCacheByLang.get(lang)!;

  const dir = path.join(resolveContentRoot(), langDir(lang));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson"));

  if (files.length === 0) throw new Error(`No .ndjson files found in ${dir}`);

  const byId = new Map<string, Fact>();
  const defaultCategory = lang === "en" ? "General Knowledge" : "ידע כללי";

  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), "utf-8").split("\n");
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (entry.status === "skip") continue;
      const id = entry.id as string;
      const rawFact = entry.fact as string;
      const blank = entry.blank as string;
      if (!id || !rawFact || !blank) continue;
      const fact_template = fixTemplate(rawFact.replace("[blank]", "_______"), blank);
      if (!fact_template.includes("_______")) continue;
      byId.set(id, {
        content_id: id,
        fact_template,
        truth_keyword: blank,
        metadata: { difficulty: "Hard", category: defaultCategory },
      });
    }
  }

  const facts = Array.from(byId.values());
  if (facts.length === 0) throw new Error(`No valid facts loaded for lang "${lang}" from ${dir}`);

  for (const fact of facts) {
    if (!fact.content_id || !fact.fact_template || !fact.truth_keyword) {
      throw new Error(`Invalid fact: ${JSON.stringify(fact)}`);
    }
  }

  factsCacheByLang.set(lang, facts);
  return facts;
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

  const filename = lang === "en" ? "personal_questions.en.json" : `personal_questions.${lang}.json`;
  const filePath = path.join(
    resolveContentRoot(),
    langDir(lang),
    "special",
    "personal_question",
    filename
  );

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

let playlistCache: PlaylistEntry[] | null = null;

export function loadPlaylists(): PlaylistEntry[] {
  if (playlistCache !== null) return playlistCache;
  const filePath = path.join(
    resolveContentRoot(),
    "heb",
    "special",
    "playlist_name",
    "playlists.he.json"
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as PlaylistEntry[];
  if (!Array.isArray(data) || data.length === 0) throw new Error("playlists.he.json must be a non-empty array");
  for (const entry of data) {
    if (!entry.content_id || !entry.name || !Array.isArray(entry.tracks) || entry.tracks.length === 0)
      throw new Error(`Invalid playlist entry: ${JSON.stringify(entry)}`);
  }
  playlistCache = data;
  return data;
}

export function getRandomPlaylist(usedIds: string[]): PlaylistEntry | null {
  let playlists: PlaylistEntry[];
  try { playlists = loadPlaylists(); } catch { return null; }
  const available = playlists.filter((p) => !usedIds.includes(p.content_id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function buildPlaylistFact(entry: PlaylistEntry): Fact {
  return {
    content_id: entry.content_id,
    fact_template: "מהו שם הפלייליסט?",
    truth_keyword: entry.name,
    metadata: { difficulty: "Medium", category: "Music" },
    playlist_tracks: entry.tracks,
  };
}
