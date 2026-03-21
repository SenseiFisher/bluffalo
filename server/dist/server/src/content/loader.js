"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFacts = loadFacts;
exports.getFacts = getFacts;
exports.getRandomFact = getRandomFact;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let cachedFacts = null;
function loadFacts() {
    if (cachedFacts)
        return cachedFacts;
    // Resolve facts path — works for both ts-node-dev (src/) and compiled (dist/) layouts
    // In dist: __dirname = server/dist/server/src/content/ — 5 levels up to project root
    // In src:  __dirname = server/src/content/             — 4 levels up to project root
    // We detect by checking if the dist path contains "dist"
    const isDist = __dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.includes("/dist/");
    const levelsUp = isDist ? "../../../../../" : "../../../../";
    const factsPath = process.env.FACTS_PATH
        ? path.resolve(process.env.FACTS_PATH)
        : path.resolve(__dirname, levelsUp, "content/facts.json");
    const raw = fs.readFileSync(factsPath, "utf-8");
    const data = JSON.parse(raw);
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
function getFacts() {
    if (!cachedFacts) {
        return loadFacts();
    }
    return cachedFacts;
}
function getRandomFact(usedIds) {
    const facts = getFacts();
    const available = facts.filter((f) => !usedIds.includes(f.content_id));
    if (available.length === 0)
        return null;
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
}
