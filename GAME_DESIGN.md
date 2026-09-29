# Neon Orchard

## One-line pitch

Grow a glowing orchard on a tiny drifting planet by routing sunlight between trees before the night storm arrives; chain efficient connections for score, then spend fruit-energy on clever upgrades that change the next run.

## Player fantasy and core loop

The player is a small caretaker drone restoring an abandoned orbital orchard. Each round presents a compact grid of soil tiles, seed pods, sunlight nodes, and hazards. The player drags a continuous path from a sunlight node through planted trees, trying to illuminate as many trees as possible without crossing a storm tile or exceeding the path's energy budget.

The loop is:

1. Read the board and identify a high-value route.
2. Click/tap-drag to draw a route; release to grow the connected trees.
3. Harvest the resulting fruit, with bonuses for long routes, unused energy, and completing optional patterns.
4. Choose one of three run upgrades.
5. Start the next, slightly more dangerous board.

Each round should take 20–45 seconds. The pleasure comes from seeing a messy board become an elegant glowing circuit, then taking a risk for a bigger chain.

## Controls and rules

- Mouse: click-drag from a sun node through tree tiles, release to commit.
- Touch: press-drag with one finger; a visible route preview follows the finger.
- Keyboard: arrow keys move a cursor; Space starts/extends a route; Enter commits; R restarts the current run.
- Escape cancels the route preview and returns focus to the board.

Rules:

- A route must begin at an active sun node and end on a tree or power relay.
- The route may travel orthogonally through empty soil and may not revisit a tile.
- Each empty tile costs 1 energy; each tree costs 0 energy and adds its fruit value.
- A storm tile blocks a route. Crossing a previously used route is allowed but gives no extra tree benefit.
- The round ends when all trees are lit, the player commits three failed routes, or the storm countdown reaches zero.
- A failed route consumes one attempt but never deletes already harvested progress.

## Scoring and progression

Score for each committed route is:

`fruit value × trees lit + route length bonus + unused energy bonus + pattern bonus`

Use a short-lived combo meter: successive successful routes within the same round increase the multiplier, while a failed route resets it. Display the score gain immediately beside the route so the player understands why a move was valuable.

After each round, award fruit-energy based on score. Offer three randomly selected upgrades, with one free choice:

- **Deep Roots:** increase maximum route energy by 2.
- **Prism Leaves:** the first tree in every route doubles its value.
- **Storm Glass:** reveal the next storm tile before the round begins.
- **Relay Seed:** place one extra sun node on the board.
- **Quick Bloom:** add 4 seconds to the round timer.
- **Bramble Map:** pattern bonuses are worth more but boards contain one extra hazard.

Progression is run-based rather than inventory-heavy. A run contains eight rounds; round 4 is an easier “harvest festival” with no countdown, and round 8 is a final storm board with a large central tree. Completing the run shows the final score and best combo. Persist only the best score, best round, and settings in `localStorage`.

## Difficulty curve

- Rounds 1–2: 5×5 board, generous energy, no storm movement, clear sun/tree colors.
- Rounds 3–4: 6×6 board, branching routes, first pattern bonuses, slow storm countdown.
- Rounds 5–6: 7×7 board, blocked soil, moving storm tiles, multiple sun nodes.
- Round 7: 8×8 board, lower energy, valuable but isolated trees, shorter timer.
- Round 8: 9×9 finale, mixed hazards and a high-value core tree; the goal is a strong final route, not perfect completion.

Random generation must guarantee at least one valid route to every required tree. Prefer deterministic seeded generation per run so a restart is fair and debuggable. Never make an early board depend on blind guessing.

## Win, lose, and restart states

- **Round clear:** all required trees glow, a “Harvest complete” card shows score and bonus breakdown, then the upgrade choice appears.
- **Run victory:** after round 8, show “Orchard restored,” final score, best score comparison, a compact round summary, and buttons for **Play again** and **Replay seed**.
- **Round loss:** the storm reaches the orchard or three route attempts fail. Show the score earned and **Try round again** (same board and seed) plus **End run**.
- **Pause:** pause the timer and input from a clearly labeled button or `P`; never pause automatically when focus changes.
- **Restart:** `R` and a visible button restart the current round after a confirmation only if the player has already committed a route. The seed and upgrade state remain unchanged.

## Visual and audio direction

Use a dark indigo space backdrop, a warm yellow sun, cyan route lines, lime trees, and magenta storm hazards. The board should be readable at a glance: chunky tiles, strong silhouettes, restrained glow, and no essential information conveyed by color alone. The route preview pulses; lit trees bloom from seed to fruit; storms wobble and leave a dotted forecast trail.

Audio should be lightweight and optional: a soft synth pluck for each tree, a rising arpeggio for a combo, a low filtered rumble for the storm, and a bright completion chord. Include a master mute and separate music/effects toggles. Haptics may briefly pulse on mobile route commit and round clear.

## Accessibility and mobile requirements

- Provide a high-contrast mode that removes bloom and adds patterns/icons to sun, tree, relay, and storm tiles.
- Do not rely on color: use distinct glyphs and route labels, plus a text status line such as “Route: 6 tiles, 3 trees, 2 energy remaining.”
- Support full keyboard play and visible focus rings; the board must expose tile coordinates and state to screen readers where practical.
- Offer a reduced-motion setting that disables pulsing, camera drift, and transition effects.
- Keep touch targets at least 44×44 CSS pixels, prevent page scrolling while dragging on the board, and support portrait mobile layouts without hiding score or timer.
- Announce route result, combo, timer warnings, and round state through an ARIA live region.

## Implementation acceptance criteria

- The game loads without a build step in a modern desktop and mobile browser and has a playable first round within one screen.
- A player can complete a valid route with mouse, touch, and keyboard; invalid routes explain the failure without throwing an error.
- Board generation is seeded, visibly fair, and guarantees a solvable required-tree set.
- Score, combo, timer, energy, attempts, upgrade choices, round number, and storm forecast are always understandable and update immediately.
- All eight rounds have the stated progression, with a clear round-clear screen, upgrade screen, run-victory screen, loss screen, pause, and restart behavior.
- Best score and settings persist locally; no network, account, or external asset is required.
- The layout remains usable at 320px-wide mobile viewport and at desktop widths; dragging does not select text or scroll the page.
- High-contrast, reduced-motion, mute, keyboard-only, and screen-reader status behaviors are testable from the UI.
- No uncaught console errors occur during a complete win, a loss, a restart, and a replay of the same seed.
