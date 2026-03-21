# PRD.md — Product Requirements Document
### Project: "Project Fabricate" | Inspired by Fibbage (Jackbox Games)
**Version:** 1.2 | **Status:** Active

---

## 1. Product Vision

**Project Fabricate** is a synchronized, mobile-first multiplayer social deception game. Players compete to craft the most plausible fake "Key Word" to complete a bizarre real-world fact, while simultaneously attempting to identify the truth among their friends' fabrications.

Every player's device serves as both their personal controller and their primary game display. There is no central screen dependency — the full game experience, including prompts, reveals, animations, and leaderboards, is delivered simultaneously to each player's device.

---

## 2. Core Product Pillars

- **Omni-Display:** Every player sees the same game state on their own device. No shared screen is required.
- **Zero Barrier to Entry:** A player must be able to join a session and understand how to play within 30 seconds — no tutorial required.
- **Peer-Generated Content:** The competition is driven entirely by player-submitted lies. The quality of the social experience scales with player creativity.
- **Remote-Ready:** Fully playable over any distance without screen sharing.

---

## 3. Game Flow (State Machine)

The game progresses linearly through the following phases. All phase transitions are broadcast simultaneously to every connected player's device.

### Phase 1 — Lobby
- Players join a session via a unique **4-character Room Code**.
- Each player sets a **Display Name** (no account required).
- A live **Player List** updates on all devices as participants join.
- The **Room Master** (first player to create the room) has the exclusive ability to start the game.
- The Room Master selects the **number of rounds** before starting (default: 7).

### Phase 2 — The Prompt
- All devices display the same **Fact Template**: a sentence describing an obscure real-world fact with a single Key Word replaced by a blank (`_______`).
- The missing word is the most surprising or critical element of the fact — the "punchline."
- Players are given a countdown timer to privately type a **Plausible Lie** into the text field on their own device.
- No player can see another player's submission during this phase.
- Players who submit early see a **"Waiting for others…"** holding screen until the phase ends.

### Phase 3 — The Reveal
- Once all lies are collected (or the timer expires), all devices simultaneously display the full list of options: every player's submitted lie + the True Key Word, presented in a **randomized order**.
- The list is identical across all devices. Order is randomized per round, not per player.
- Player names are **not shown** next to their submissions at this stage.

### Phase 4 — The Selection (Voting)
- Players tap the option on their own device that they believe is the **True Key Word**.
- A player's **own submission is hidden** from their voting list — self-voting is not permitted.
- A countdown timer governs this phase. Players who do not vote in time forfeit the Truth Seeker bonus for that round.

### Phase 5 — The Resolution
- All devices display a **sequential, animated reveal**:
  - Each lie is unmasked, showing which players authored it and who voted for it.
  - The True Key Word is revealed last.
  - Round scores are calculated and displayed.
- A **round leaderboard** updates on all devices after the resolution.

### Phase 6 — The Podium (Final Round Only)
- After the final round's Resolution, all devices transition to the **End-of-Game Podium**.
- The top three players are displayed with their final scores and a summary stat: **Total Players Fooled**.
- The session ends here. Players may return to the Lobby to start a new game with the same group.

---

## 4. Scoring System

### Standard Scoring

| Event | Points | Condition |
|---|---|---|
| **Truth Seeker** | +500 | Player correctly identifies the True Key Word. |
| **The Bamboozle** | +250 per vote | Awarded to the lie's author for each opponent who selected it. No cap. |
| **Great Minds Bonus** | +1,000 | Player's submitted lie is an exact match to the True Key Word (case-insensitive). Their entry is removed from the voting list. |

> **Note on the Great Minds Bonus:** This rewards players who independently arrive at the truth, while preserving game integrity by ensuring their submission does not appear on the voting screen and inadvertently reveal the answer.

### Final Round Multiplier
- In the **final round**, all points earned are multiplied by **2.0×**.
- This mechanic is surfaced to players at the start of the final round via an on-screen notification on all devices.
- Intent: To maintain competitive tension and enable late-game comebacks.

### Tie-Breaking Protocol
In the event of a score tie at the end of the game:

1. **Primary:** The player with the highest cumulative **Deception Count** (total votes received on their lies across all rounds) ranks higher.
2. **Secondary:** If still tied, the player who reached that score total **first** (earlier in the game) ranks higher.

---

## 5. Content Design

### Fact Template Specification
- Each fact must be a single, grammatically complete sentence with exactly **one blank** (`_______`).
- The blank must replace the **most surprising or counterintuitive element** of the fact — the word or short phrase that makes the fact remarkable.
- The Key Word should be a **single word or short phrase** (maximum 4 words) to keep competition fair.
- Facts should be sourced from verifiable, obscure real-world events. The player should have no reasonable way to know the answer from general knowledge.

### Fact Object Schema

```json
{
  "content_id": "FACT_2026_042",
  "fact_template": "In 1924, a _______ was put on trial in South Africa and sentenced to hard labor.",
  "truth_keyword": "Baboon",
  "metadata": {
    "difficulty": "Medium",
    "category": "Historical Oddities"
  }
}
```

### Content Volume
- Minimum viable launch: **100 unique facts** to prevent repetition across a standard session.
- Duplicate prevention: A fact may not appear twice within the same session.

---

## 6. Session & Player Management

### Room System
- Sessions are identified by a **4-character alphanumeric Room Code** (e.g., `KXQZ`).
- Codes are case-insensitive and scoped to an active session only.

### Player Identity
- Players join with a **Display Name** only. No account, login, or password is required.
- Identity is maintained via a **session-scoped ID** stored on the player's device.

### Reconnection
- If a player's browser refreshes or their connection drops during an active session, they must be able to **rejoin using their existing session ID** and resume with their score and progress intact.
- A reconnecting player picks up at the current phase. If they reconnect mid-Fabrication phase, they may still submit if time remains.

### Inactivity Handling
- **Fabrication Phase timeout:** The player's lie is not displayed in the voting round. They are ineligible for Bamboozle points that round.
- **Selection Phase timeout:** The player's vote is not counted. They forfeit the Truth Seeker bonus for that round.
- Game progression is **not blocked** by inactive players.

---

## 7. Input Rules & Validation

- **Character Limit:** Player lies are capped at **50 characters**.
- **Prohibited Content:** All inputs are sanitized to strip HTML and special characters.
- **Duplicate Suppression:** If two players submit identical lies, both are displayed but attributed correctly (i.e., the duplicate is shown once to voters, but both authors receive Bamboozle credit if it is selected).
- **Great Minds Collision:** If a player's lie exactly matches the `truth_keyword` (case-insensitive, trimmed), the Great Minds Bonus is triggered and their submission is removed from the voting list.
- **Normalization:** All submitted lies are trimmed of leading/trailing whitespace and compared case-insensitively for collision detection.

---

*End of Document*
