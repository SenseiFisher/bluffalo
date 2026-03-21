# Question Writing Guidelines

## Core Principle

The blank (`_______`) should always contain the **most surprising or counterintuitive part of the fact** — the piece of information that makes someone say "wait, really?". If the blank were filled in with the obvious answer, it wouldn't be a good question.

> ✅ "Wombats are the only animals in the world that produce _______ shaped droppings." → **cube**
> The surprise IS the answer. Players who don't know will invent plausible-sounding shapes, which makes for great lies.

> ❌ "The _______ Tower can grow up to 15 centimetres taller in summer." → **Eiffel**
> The Eiffel Tower is not the interesting part — the 15 cm growth is. The blank should be the number.

---

## The Blank

- Must be the fact's **punchline** — the stat, name, or detail that nobody would guess without knowing
- Should be **short**: ideally 1–3 words or a number. Long answers are hard to lie about convincingly
- Must fit naturally into the sentence so the full sentence reads fluently when filled in
- Avoid blanking **obvious** or **easy-to-guess** words (colors, well-known countries, famous names)
- The blank should allow players to write **plausible-sounding lies** — if the truth is too strange to fake around, the game isn't fun

---

## Language & Translation

Questions must work in **any language** without losing meaning or humor:

- **No wordplay, puns, or idioms** that only make sense in English
- **No culturally-specific references** that players from other countries would not recognize (e.g., regional TV shows, local politicians, domestic brand names)
- Proper nouns (countries, famous landmarks, well-known historical figures) are fine — they are universal
- Numbers and measurements are fine — just use the unit written out (`centimetres`, not `cm`) so it survives translation
- Avoid facts whose surprise depends on an English-language coincidence (rhymes, double meanings, etc.)

> ✅ "Octopuses have _______ hearts." — works in any language
> ❌ "The word 'nerd' was first used in _______ book." — depends on English-language literary context

---

## What Makes a Good Question

| Quality | Description |
|---|---|
| **Surprising truth** | The real answer should feel wrong at first — that's what makes players doubt their lies |
| **Bluffable blank** | Players need to be able to invent a convincing lie. If only one answer could possibly fit, nobody gets fooled |
| **Self-contained** | The sentence should make sense without any external context or prior knowledge of the topic |
| **Verifiable** | The fact must be true and sourced. Disputed or approximate facts cause arguments |
| **Universal subject** | Nature, science, history, the human body, animals, space, food — topics that cross cultures |

---

## What to Avoid

- **Trivia that rewards memorization** — the game is about deception, not knowledge. A fact nobody can reasonably guess is better than a fact someone might just know
- **Ambiguous answers** — if multiple things could correctly fill the blank, the fact is broken
- **Leading sentences** — the surrounding words should not make the answer too obvious by elimination
- **Sensitive or exclusionary topics** — politics, religion, recent tragedies
- **Proper nouns as the blank when the sentence gives it away** — e.g., "The national dish of Japan is _______" is too narrowed by context

---

## Difficulty Guide

| Difficulty | Characteristic |
|---|---|
| **Easy** | Most players have a rough sense of the answer range, but the exact truth is still surprising |
| **Medium** | The topic is familiar but the specific fact is obscure enough that good lies blend in |
| **Hard** | The truth sounds so implausible that even correct guesses feel like lucky guesses |

---

## Template Format

```json
{
  "content_id": "FACT_XXX",
  "fact_template": "Sentence with _______ where the surprising part goes.",
  "truth_keyword": "short answer",
  "metadata": { "difficulty": "Easy | Medium | Hard", "category": "Category" }
}
```

The `truth_keyword` should be the **minimal form** of the answer — what would fit naturally in the blank and nothing more.
