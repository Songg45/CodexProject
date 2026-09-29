(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE = {
    best: "neon-orchard-best-v1",
    settings: "neon-orchard-settings-v1"
  };

  const ROUND_CONFIG = [
    { size: 5, trees: 5, energy: 9, time: 48, hazards: 1, blocked: 0, movers: 0, name: "Sprout orbit", title: "Route the first bloom" },
    { size: 5, trees: 6, energy: 9, time: 46, hazards: 2, blocked: 0, movers: 0, name: "Twin canopy", title: "Find the second rhythm" },
    { size: 6, trees: 7, energy: 10, time: 43, hazards: 2, blocked: 2, movers: 0, name: "Branching light", title: "Thread the young canopy" },
    { size: 6, trees: 8, energy: 10, time: 0, hazards: 2, blocked: 2, movers: 0, name: "Harvest festival", title: "A quiet orbit to harvest" },
    { size: 7, trees: 9, energy: 10, time: 40, hazards: 3, blocked: 3, movers: 1, name: "Moving weather", title: "Outrun the weather" },
    { size: 7, trees: 10, energy: 10, time: 38, hazards: 3, blocked: 4, movers: 1, name: "Glass horizon", title: "Route through the shimmer" },
    { size: 8, trees: 10, energy: 9, time: 35, hazards: 4, blocked: 5, movers: 1, name: "Thin atmosphere", title: "Make every tile count" },
    { size: 9, trees: 12, energy: 10, time: 32, hazards: 5, blocked: 6, movers: 2, name: "Final storm", title: "Restore the heart of the orchard" }
  ];

  const UPGRADES = [
    { id: "deep-roots", name: "Deep Roots", icon: "⌁", tag: "+2 ENERGY", description: "Increase maximum route energy by 2 on every board." },
    { id: "prism-leaves", name: "Prism Leaves", icon: "◇", tag: "FIRST TREE", description: "The first fresh tree in every route doubles its fruit value." },
    { id: "storm-glass", name: "Storm Glass", icon: "◌", tag: "FORECAST", description: "Reveal the next moving storm tile before the round begins." },
    { id: "relay-seed", name: "Relay Seed", icon: "⌘", tag: "+1 NODE", description: "Plant one extra sunlight relay on every new board." },
    { id: "quick-bloom", name: "Quick Bloom", icon: "✺", tag: "+4 SECONDS", description: "Add four seconds to every timed round." },
    { id: "bramble-map", name: "Bramble Map", icon: "⌗", tag: "RISK / REWARD", description: "Pattern bonuses grow larger, but each board gets one extra hazard." }
  ];

  const DEFAULT_SETTINGS = {
    muted: false,
    music: false,
    effects: true,
    highContrast: false,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  };

  const state = {
    phase: "play",
    runSeed: 0,
    round: 1,
    roundSeed: 0,
    roundStartScore: 0,
    board: null,
    route: [],
    routeActive: false,
    routeInvalid: "",
    historicalRoutes: [],
    attemptsLeft: 3,
    score: 0,
    combo: 0,
    bestCombo: 0,
    best: { score: 0, round: 0, combo: 0 },
    lastGain: 0,
    lastBreakdown: null,
    statusOverride: "",
    upgrades: [],
    upgradeOptions: [],
    roundHistory: [],
    lastFocusedIndex: 0,
    keyboardFocus: false,
    pointerId: null,
    stormCursor: 0,
    stormElapsed: 0,
    lastTick: 0,
    timer: 0,
    timerMax: 0,
    log: [],
    settings: loadJSON(STORAGE.settings, DEFAULT_SETTINGS),
    audioContext: null,
    ambient: null,
    ignoreNextClick: false,
    confirmAction: null
  };

  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };

  function loadJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode can disable storage. */ }
  }

  function hashSeed(...parts) {
    let hash = 2166136261;
    const text = parts.join(":");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomSeed() {
    const cryptoApi = window.crypto;
    if (cryptoApi?.getRandomValues) {
      const values = new Uint32Array(1);
      cryptoApi.getRandomValues(values);
      return values[0] >>> 0;
    }
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  function rngFrom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(values, rng) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function hasUpgrade(id) { return state.upgrades.includes(id); }
  function config() { return ROUND_CONFIG[state.round - 1]; }
  function maxEnergy() { return config().energy + (hasUpgrade("deep-roots") ? 2 : 0); }
  function multiplier() { return 1 + Math.max(0, state.combo - 1) * 0.25; }
  function formatScore(value) { return Math.max(0, Math.round(value)).toString().padStart(6, "0"); }
  function formatSeed(value) { return value.toString(36).toUpperCase().padStart(6, "0").slice(-6); }
  function rowCol(index, size = state.board?.size || 1) { return { row: Math.floor(index / size), col: index % size }; }
  function labelCoord(index, size = state.board?.size || 1) { const { row, col } = rowCol(index, size); return `R${row + 1} C${col + 1}`; }
  function isAdjacent(a, b, size = state.board.size) { const one = rowCol(a, size); const two = rowCol(b, size); return Math.abs(one.row - two.row) + Math.abs(one.col - two.col) === 1; }
  function isDynamicStorm(index) { return state.board?.dynamicStormIndex === index; }
  function isHazard(index) { const cell = state.board.cells[index]; return cell.kind === "storm" || cell.kind === "blocked" || isDynamicStorm(index); }
  function isActiveNode(cell) { return cell.kind === "sun" || cell.kind === "relay"; }

  function buildSafePath(size) {
    const path = [];
    for (let row = 0; row < size; row += 1) {
      if (row % 2 === 0) {
        const lane = (row / 2) % 2 === 0 ? [...Array(size).keys()] : [...Array(size).keys()].reverse();
        lane.forEach((col) => path.push(row * size + col));
      } else {
        const col = ((row - 1) / 2) % 2 === 0 ? size - 1 : 0;
        path.push(row * size + col);
      }
    }
    return path;
  }

  function buildBoard(seed) {
    const roundConfig = config();
    const rng = rngFrom(seed);
    const size = roundConfig.size;
    const total = size * size;
    const cells = Array.from({ length: total }, () => ({ kind: "soil" }));
    const safePath = buildSafePath(size);
    const safeSet = new Set(safePath);
    const sunIndices = [safePath[0]];
    if (size >= 7) {
      [size - 1, (size - 1) * size, total - 1].forEach((index) => {
        if (safeSet.has(index) && !sunIndices.includes(index)) sunIndices.push(index);
      });
    }
    sunIndices.forEach((index, nodeNumber) => { cells[index] = { kind: "sun", id: `sun-${nodeNumber}` }; });

    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    const candidateTrees = shuffled(safePath.filter((index) => cells[index].kind === "soil"), rng);
    const treePositions = [];
    if (state.round === 8 && center !== sunIndex) treePositions.push(center);
    for (const index of candidateTrees) {
      if (treePositions.length >= roundConfig.trees) break;
      if (!treePositions.includes(index)) treePositions.push(index);
    }
    const treeIds = [];
    treePositions.forEach((index, treeNumber) => {
      const isCore = state.round === 8 && index === center;
      const value = isCore ? 9 : 1 + Math.floor(rng() * (state.round >= 5 ? 5 : 4));
      const id = `tree-${treeNumber}`;
      cells[index] = { kind: "tree", id, value, lit: false, required: true };
      treeIds.push(id);
    });

    if (hasUpgrade("relay-seed")) {
      const relayIndex = shuffled(safePath.filter((index) => cells[index].kind === "soil"), rng)[0];
      if (relayIndex !== undefined) cells[relayIndex] = { kind: "relay", id: "relay-seed" };
    }

    const offPath = shuffled([...Array(total).keys()].filter((index) => !safeSet.has(index) && cells[index].kind === "soil"), rng);
    const hazardCount = Math.min(offPath.length, roundConfig.hazards + (hasUpgrade("bramble-map") ? 1 : 0));
    const blockedCount = Math.min(Math.max(0, offPath.length - hazardCount), roundConfig.blocked);
    const stormIndices = offPath.slice(0, hazardCount);
    const blockedIndices = offPath.slice(hazardCount, hazardCount + blockedCount);
    stormIndices.forEach((index) => { cells[index] = { kind: "storm", id: `storm-${index}` }; });
    blockedIndices.forEach((index) => { cells[index] = { kind: "blocked", id: `blocked-${index}` }; });

    const movingTrack = shuffled(offPath.filter((index) => cells[index].kind === "soil"), rng).slice(0, roundConfig.movers ? Math.max(3, roundConfig.movers + 2) : 0);
    const dynamicStormIndex = movingTrack.length ? movingTrack[0] : -1;
    const board = {
      size,
      cells,
      safePath,
      treeIds,
      staticStorms: stormIndices,
      blocked: blockedIndices,
      movingTrack,
      dynamicStormIndex,
      forecastIndex: movingTrack.length > 1 ? movingTrack[1] : stormIndices[0] ?? -1,
      treeCount: treeIds.length
    };
    return board;
  }

  function resetRoute() {
    state.route = [];
    state.routeActive = false;
    state.routeInvalid = "";
    state.pointerId = null;
  }

  function startNewRun(seed = randomSeed()) {
    clearOverlay();
    state.phase = "play";
    state.runSeed = seed >>> 0;
    state.round = 1;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.upgrades = [];
    state.roundHistory = [];
    state.statusOverride = "";
    state.log = [];
    addLog(`Run ${formatSeed(state.runSeed)} initialized.`);
    startRound(1, true);
  }

  function startRound(round, initial = false) {
    if (round < 1 || round > 8) return;
    clearOverlay();
    state.phase = "play";
    state.round = round;
    state.roundSeed = hashSeed(state.runSeed, round, "board");
    state.board = buildBoard(state.roundSeed);
    state.roundStartScore = state.score;
    state.attemptsLeft = 3;
    state.historicalRoutes = [];
    state.lastGain = 0;
    state.lastBreakdown = null;
    state.statusOverride = "";
    state.stormCursor = 0;
    state.stormElapsed = 0;
    state.timerMax = config().time ? config().time + (hasUpgrade("quick-bloom") ? 4 : 0) : 0;
    state.timer = state.timerMax;
    state.lastTick = performance.now();
    resetRoute();
    state.lastFocusedIndex = state.board.safePath[0];
    if (!initial) {
      addLog(`Round ${String(round).padStart(2, "0")} opened: ${config().name}.`);
      announce(`Round ${round}, ${config().name}. Find a sun node and route the trees.`);
    }
    render();
  }

  function announce(message) {
    $("liveRegion").textContent = message;
  }

  function addLog(message) {
    state.log.unshift(message);
    state.log = state.log.slice(0, 4);
    const list = $("logList");
    if (list) list.innerHTML = state.log.map((entry) => `<li>${entry}</li>`).join("");
  }

  function updateBest() {
    if (state.score > state.best.score) state.best.score = state.score;
    if (state.round > state.best.round && state.phase !== "play") state.best.round = state.round;
    if (state.bestCombo > state.best.combo) state.best.combo = state.bestCombo;
    saveJSON(STORAGE.best, state.best);
  }

  function render() {
    document.body.classList.toggle("high-contrast", Boolean(state.settings.highContrast));
    document.body.classList.toggle("reduced-motion", Boolean(state.settings.reducedMotion));
    renderBoard();
    renderRouteLayer();
    renderUI();
    updateSettingsInputs();
    if (state.phase === "play" && !$("overlay").hidden) clearOverlay();
  }

  function tileAppearance(index) {
    const cell = state.board.cells[index];
    const dynamic = isDynamicStorm(index);
    if (dynamic) return { className: "storm dynamic-storm", glyph: "✹", type: "moving storm" };
    switch (cell.kind) {
      case "sun": return { className: "sun", glyph: "✦", type: "sun node" };
      case "relay": return { className: "relay", glyph: "⌘", type: "power relay" };
      case "tree": return { className: `tree${cell.lit ? " lit" : ""}`, glyph: cell.lit ? "✿" : "♣", type: cell.lit ? "lit tree" : `tree, fruit value ${cell.value}` };
      case "blocked": return { className: "blocked", glyph: "▧", type: "blocked soil" };
      case "storm": return { className: "storm", glyph: "✹", type: "storm tile" };
      default: return { className: "soil", glyph: "·", type: "empty soil" };
    }
  }

  function renderBoard() {
    if (!state.board) return;
    const board = $("board");
    const currentFocus = state.lastFocusedIndex;
    board.style.gridTemplateColumns = `repeat(${state.board.size}, minmax(0, 1fr))`;
    board.setAttribute("aria-rowcount", state.board.size);
    board.setAttribute("aria-colcount", state.board.size);
    board.innerHTML = state.board.cells.map((cell, index) => {
      const appearance = tileAppearance(index);
      const routeIndex = state.route.indexOf(index);
      const routeClass = routeIndex >= 0 ? " route-tile" : "";
      const endpointClass = routeIndex === 0 ? " route-start" : (routeIndex === state.route.length - 1 && state.route.length > 1 ? " route-end" : "");
      const errorClass = state.routeInvalid && routeIndex === state.route.length - 1 ? " error-tile" : "";
      const forecastClass = state.board.forecastIndex === index && (hasUpgrade("storm-glass") || config().movers) ? " forecasted" : "";
      const { row, col } = rowCol(index, state.board.size);
      const label = `${labelCoord(index, state.board.size)}: ${appearance.type}${cell.kind === "tree" && cell.lit ? ", harvested" : ""}${forecastClass ? ", forecast tile" : ""}`;
      return `<button class="tile ${appearance.className}${routeClass}${endpointClass}${errorClass}${forecastClass}" type="button" data-index="${index}" role="gridcell" aria-label="${label}" aria-rowindex="${row + 1}" aria-colindex="${col + 1}" tabindex="${index === currentFocus ? "0" : "-1"}"><span class="tile-mark" aria-hidden="true">${cell.kind === "tree" ? cell.value : ""}</span><span class="glyph" aria-hidden="true">${appearance.glyph}</span><span class="tile-coord" aria-hidden="true">${row + 1}.${col + 1}</span></button>`;
    }).join("");
    if (state.keyboardFocus) focusTile(currentFocus);
  }

  function focusTile(index) {
    const tile = $("board").querySelector(`[data-index="${index}"]`);
    if (tile) tile.focus({ preventScroll: true });
  }

  function renderRouteLayer() {
    if (!state.board) return;
    const layer = $("routeLayer");
    const size = state.board.size;
    const pointFor = (index) => { const { row, col } = rowCol(index, size); return `${((col + 0.5) / size) * 100},${((row + 0.5) / size) * 100}`; };
    const polyline = (indexes, className, width = 1.2) => {
      if (indexes.length < 2) return "";
      return `<polyline class="route-line ${className}" points="${indexes.map(pointFor).join(" ")}" stroke-width="${width}" />`;
    };
    const oldRoutes = state.historicalRoutes.map((entry) => polyline(entry.indexes, "historical", 1.1)).join("");
    const preview = polyline(state.route, state.routeInvalid ? "preview invalid" : "preview", 2.2);
    layer.innerHTML = `${oldRoutes}${preview}`;
  }

  function renderUI() {
    const roundConfig = config();
    const litTrees = state.board ? state.board.cells.filter((cell) => cell.kind === "tree" && cell.lit).length : 0;
    const treeTotal = state.board?.treeCount || roundConfig.trees;
    const timerSeconds = Math.max(0, Math.ceil(state.timer));
    $("roundValue").innerHTML = `${String(state.round).padStart(2, "0")} <small>/ 08</small>`;
    $("roundTag").textContent = roundConfig.name;
    $("roundTitle").textContent = roundConfig.title;
    $("scoreValue").textContent = formatScore(state.score);
    $("scoreDelta").textContent = state.lastGain ? `+${state.lastGain.toLocaleString()} last route` : (state.score ? "Keep the chain alive" : "Ready to route");
    $("comboValue").textContent = `×${multiplier().toFixed(1)}`;
    $("comboNote").textContent = state.combo > 1 ? `${state.combo} successful routes chained` : "Build a chain";
    $("timerValue").textContent = state.timerMax ? `${timerSeconds}s` : "∞";
    $("timerMeter").style.width = state.timerMax ? `${Math.max(0, Math.min(100, (state.timer / state.timerMax) * 100))}%` : "100%";
    $("timerNote").textContent = state.timerMax ? (timerSeconds <= 8 ? "Storm closing in" : (roundConfig.movers ? "Storm track is moving" : "Forecast stable")) : "Festival orbit · no countdown";
    $("seedValue").textContent = formatSeed(state.runSeed);
    $("attemptsValue").textContent = `${state.attemptsLeft} ${state.attemptsLeft === 1 ? "attempt" : "attempts"}`;
    $("treeCount").textContent = `${litTrees} / ${treeTotal}`;
    $("harvestProgress").style.width = `${treeTotal ? (litTrees / treeTotal) * 100 : 0}%`;
    $("harvestText").textContent = litTrees >= treeTotal ? "Every required tree is glowing." : `${treeTotal - litTrees} required ${treeTotal - litTrees === 1 ? "tree" : "trees"} remain in this orbit.`;
    $("hazardCount").textContent = `${state.board?.staticStorms.length || 0} storm tiles${roundConfig.movers ? " · moving track" : ""}`;
    const forecast = state.board?.forecastIndex >= 0 ? labelCoord(state.board.forecastIndex, state.board.size) : "clear sky";
    $("forecastText").textContent = roundConfig.time === 0 ? "Harvest festival: the storm is holding its breath. Take the elegant route." : (roundConfig.movers ? `Next storm shift near ${forecast}. ${hasUpgrade("storm-glass") ? "Storm Glass has marked it." : "Watch the dotted tile."}` : `Static hazards marked. Keep ${maxEnergy()} energy available for the long way home.`);
    $("forecastTrackFill").style.width = roundConfig.time ? `${Math.max(4, (state.stormElapsed / Math.max(1, roundConfig.movers ? 6 : 999)) * 100)}%` : "100%";
    $("glassNote").textContent = hasUpgrade("storm-glass") ? "Storm Glass online" : "Storm Glass offline";
    $("statusLine").innerHTML = statusText();
    $("upgradeChips").innerHTML = state.upgrades.length ? state.upgrades.map((id) => `<span class="upgrade-chip">${UPGRADES.find((upgrade) => upgrade.id === id)?.name || id}</span>`).join("") : `<span class="stat-note">No upgrades yet · choose after harvest</span>`;
    $("pauseButton").setAttribute("aria-label", state.phase === "paused" ? "Resume game" : "Pause game");
    $("pauseButton").title = state.phase === "paused" ? "Resume (P)" : "Pause (P)";
    if (!$("logList").children.length) $("logList").innerHTML = state.log.map((entry) => `<li>${entry}</li>`).join("");
    maybeFinishRound();
  }

  function maybeFinishRound() {
    if (state.phase !== "play" || state.routeActive || !state.board || !state.board.treeCount) return;
    const litTrees = state.board.cells.filter((cell) => cell.kind === "tree" && cell.lit).length;
    if (litTrees >= state.board.treeCount) finishRound();
  }

  function statusText() {
    if (state.routeActive) {
      const treeCount = state.route.filter((index) => state.board.cells[index].kind === "tree").length;
      const energy = Math.max(0, maxEnergy() - routeEnergyCost(state.route));
      if (state.routeInvalid) return `Route: ${state.route.length} tiles, ${treeCount} trees · <strong>${state.routeInvalid}</strong>`;
      return `Route: ${state.route.length} tiles, ${treeCount} trees, ${energy} energy remaining.`;
    }
    if (state.statusOverride) return state.statusOverride;
    return "Route: choose a ✦ sun node to begin.";
  }

  function routeEnergyCost(indexes) {
    return indexes.reduce((cost, index) => cost + (state.board.cells[index].kind === "soil" ? 1 : 0), 0);
  }

  function setRouteStatus(message) {
    state.statusOverride = message;
    renderUI();
  }

  function beginRoute(index) {
    if (state.phase !== "play" || state.routeActive || !state.board) return;
    const cell = state.board.cells[index];
    if (!isActiveNode(cell) || isDynamicStorm(index)) {
      setRouteStatus("Start on a ✦ sun node or ⌘ relay.");
      return;
    }
    ensureAudio();
    state.statusOverride = "";
    state.route = [index];
    state.routeActive = true;
    state.routeInvalid = "";
    state.lastFocusedIndex = index;
    playTone(440, 0.08, "sine", 0.025);
    render();
  }

  function extendRoute(index) {
    if (!state.routeActive || state.phase !== "play" || state.routeInvalid) return;
    const previous = state.route[state.route.length - 1];
    if (index === previous) return;
    if (!isAdjacent(previous, index)) {
      setRouteStatus("Routes move one tile at a time — use an orthogonal step.");
      return;
    }
    if (state.route.includes(index)) {
      state.routeInvalid = "A route cannot revisit a tile.";
      state.lastFocusedIndex = index;
      render();
      return;
    }
    state.route.push(index);
    state.lastFocusedIndex = index;
    const energy = routeEnergyCost(state.route);
    if (isHazard(index)) state.routeInvalid = "The storm blocks this tile.";
    else if (energy > maxEnergy()) state.routeInvalid = "The route exceeds your energy budget.";
    render();
  }

  function commitRoute() {
    if (!state.routeActive || state.phase !== "play") return;
    const endpoint = state.board.cells[state.route[state.route.length - 1]];
    if (state.routeInvalid) {
      failRoute(state.routeInvalid);
      return;
    }
    if (!endpoint || !["tree", "relay"].includes(endpoint.kind)) {
      failRoute("Finish on a tree or relay to commit the route.");
      return;
    }
    completeRoute();
  }

  function completeRoute() {
    const indexes = [...state.route];
    const freshTrees = [...new Set(indexes.filter((index) => {
      const cell = state.board.cells[index];
      return cell.kind === "tree" && !cell.lit;
    }))];
    const treeValues = freshTrees.map((index) => {
      const cell = state.board.cells[index];
      return cell.value * (hasUpgrade("prism-leaves") && freshTrees[0] === index ? 2 : 1);
    });
    freshTrees.forEach((index) => { state.board.cells[index].lit = true; });
    const treeCount = freshTrees.length;
    const fruitValue = treeValues.reduce((sum, value) => sum + value, 0);
    const fruitPoints = treeCount ? Math.round((fruitValue / treeCount) * treeCount * 10) : 0;
    const lengthBonus = Math.max(0, indexes.length - 2) * 2;
    const energyRemaining = Math.max(0, maxEnergy() - routeEnergyCost(indexes));
    const unusedBonus = energyRemaining * 3;
    const patternBase = treeCount >= (state.round >= 3 ? 3 : 2) ? 18 : (treeCount >= 2 ? 8 : 0);
    const patternBonus = hasUpgrade("bramble-map") ? Math.round(patternBase * 1.75) : patternBase;
    const rawTotal = fruitPoints + lengthBonus + unusedBonus + patternBonus;
    state.combo = Math.min(5, state.combo + 1);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gain = Math.max(1, Math.round(rawTotal * multiplier()));
    state.score += gain;
    state.lastGain = gain;
    state.lastBreakdown = { fruitPoints, treeCount, lengthBonus, unusedBonus, patternBonus, rawTotal, multiplier: multiplier(), gain, energyRemaining };
    state.historicalRoutes.push({ indexes, gain });
    state.statusOverride = "";
    state.route = [];
    state.routeActive = false;
    state.routeInvalid = "";
    state.lastFocusedIndex = indexes[indexes.length - 1];
    addLog(`+${gain} fruit-energy · ${treeCount || "relay"} bloom${treeCount === 1 ? "" : "s"} · combo ×${multiplier().toFixed(1)}.`);
    announce(`Route complete. ${treeCount} trees lit for ${gain} points. Combo ${multiplier().toFixed(1)}.`);
    playTone(520 + treeCount * 65, 0.14, "triangle", 0.035);
    if (treeCount >= 2) playTone(780 + state.combo * 35, 0.2, "sine", 0.02, 0.08);
    render();
    showScorePopup(indexes[indexes.length - 1], `+${gain}`);
    updateBest();
  }

  function failRoute(reason) {
    state.attemptsLeft -= 1;
    state.combo = 0;
    state.lastGain = 0;
    state.statusOverride = `Route failed: ${reason}`;
    state.route = [];
    state.routeActive = false;
    state.routeInvalid = "";
    addLog(`Route rejected · ${reason}`);
    announce(`Route failed. ${reason} ${state.attemptsLeft} attempts remain.`);
    playTone(150, 0.18, "sawtooth", 0.018);
    render();
    if (state.attemptsLeft <= 0) showLoss("The orchard needs a steadier hand.");
  }

  function cancelRoute() {
    if (!state.routeActive) return;
    resetRoute();
    state.statusOverride = "Route preview cancelled. Nothing was harvested.";
    announce("Route preview cancelled.");
    render();
  }

  function showScorePopup(index, text) {
    const popup = document.createElement("span");
    const { row, col } = rowCol(index, state.board.size);
    popup.className = "score-popup";
    popup.textContent = text;
    popup.style.left = `${((col + 0.5) / state.board.size) * 100}%`;
    popup.style.top = `${((row + 0.4) / state.board.size) * 100}%`;
    $("scorePopups").appendChild(popup);
    window.setTimeout(() => popup.remove(), state.settings.reducedMotion ? 800 : 1600);
  }

  function finishRound() {
    state.phase = "roundClear";
    state.roundHistory.push({ round: state.round, score: state.score - state.roundStartScore, total: state.score, combo: state.bestCombo });
    state.best.round = Math.max(state.best.round, state.round);
    updateBest();
    addLog(`Round ${state.round} complete · harvest secured.`);
    announce(`Harvest complete. Round ${state.round} cleared.`);
    playTone(660, 0.18, "triangle", 0.04);
    playTone(880, 0.28, "triangle", 0.035, 0.12);
    showRoundClear();
  }

  function showRoundClear() {
    const b = state.lastBreakdown || { fruitPoints: 0, treeCount: 0, lengthBonus: 0, unusedBonus: 0, patternBonus: 0, gain: 0 };
    const nextAction = state.round === 8 ? "View final harvest" : "Choose an upgrade";
    showOverlay(`<div class="overlay-icon">✿</div><p class="eyebrow">HARVEST COMPLETE · ROUND ${String(state.round).padStart(2, "0")}</p><h2>Every bloom is glowing</h2><p class="overlay-subtitle">The circuit held. Your caretaker drone banked <strong>${state.score - state.roundStartScore}</strong> fruit-energy this orbit.</p><div class="breakdown"><div class="breakdown-row"><span>Fruit value × ${b.treeCount} trees</span><strong>+${b.fruitPoints}</strong></div><div class="breakdown-row"><span>Route length bonus</span><strong>+${b.lengthBonus}</strong></div><div class="breakdown-row"><span>Unused energy</span><strong>+${b.unusedBonus}</strong></div><div class="breakdown-row"><span>Pattern bonus</span><strong>+${b.patternBonus}</strong></div><div class="breakdown-row"><span>Combo multiplier</span><strong>×${(b.multiplier || 1).toFixed(1)}</strong></div><div class="breakdown-row total"><span>Orbit harvest</span><strong>+${b.gain || 0}</strong></div></div><div class="overlay-actions"><button class="primary-button" id="roundClearContinue" type="button">${nextAction} →</button></div>`);
    $("roundClearContinue").addEventListener("click", () => {
      if (state.round === 8) finishRun();
      else showUpgradeChoice();
    });
  }

  function chooseUpgradeOptions() {
    const rng = rngFrom(hashSeed(state.roundSeed, "upgrades"));
    const unused = UPGRADES.filter((upgrade) => !hasUpgrade(upgrade.id));
    const options = shuffled(unused.length >= 3 ? unused : UPGRADES, rng).slice(0, 3);
    return options;
  }

  function showUpgradeChoice() {
    state.phase = "upgrade";
    state.upgradeOptions = chooseUpgradeOptions();
    showOverlay(`<div class="overlay-icon">◇</div><p class="eyebrow">ORBITAL GRAFTING LAB</p><h2>Choose one upgrade</h2><p class="overlay-subtitle">Spend the harvest on a change that will shape the next orbit. Every choice is free.</p><div class="upgrade-options">${state.upgradeOptions.map((upgrade) => `<button class="upgrade-option" type="button" data-upgrade="${upgrade.id}"><span class="upgrade-icon" aria-hidden="true">${upgrade.icon}</span><strong>${upgrade.name}</strong><small>${upgrade.description}</small><span class="upgrade-tag">${upgrade.tag}</span></button>`).join("")}</div>`);
    $("overlayCard").querySelectorAll("[data-upgrade]").forEach((button) => button.addEventListener("click", () => applyUpgrade(button.dataset.upgrade)));
    announce("Choose one free upgrade for the next orbit.");
  }

  function applyUpgrade(id) {
    const upgrade = UPGRADES.find((item) => item.id === id);
    if (!upgrade) return;
    if (!state.upgrades.includes(id)) state.upgrades.push(id);
    addLog(`${upgrade.name} online · ${upgrade.description}`);
    announce(`${upgrade.name} online. Preparing the next round.`);
    playTone(480, 0.1, "triangle", 0.03);
    playTone(720, 0.18, "triangle", 0.025, 0.08);
    startRound(state.round + 1);
  }

  function showLoss(reason) {
    state.phase = "loss";
    clearRouteStateForOverlay();
    const earned = Math.max(0, state.score - state.roundStartScore);
    addLog(`Round ${state.round} lost · ${earned} fruit-energy banked this attempt.`);
    announce(`Round lost. ${reason}`);
    showOverlay(`<div class="overlay-icon loss">✹</div><p class="eyebrow">ORCHARD SIGNAL LOST · ROUND ${String(state.round).padStart(2, "0")}</p><h2>${reason}</h2><p class="overlay-subtitle">The seed is safe. Try the same orbit again with the route logic you learned.</p><div class="breakdown"><div class="breakdown-row"><span>Harvest this attempt</span><strong>+${earned}</strong></div><div class="breakdown-row"><span>Run score retained</span><strong>${formatScore(state.score)}</strong></div><div class="breakdown-row"><span>Best combo</span><strong>×${(1 + Math.max(0, state.bestCombo - 1) * 0.25).toFixed(1)}</strong></div></div><div class="overlay-actions"><button class="primary-button" id="retryRoundButton" type="button">Try round again</button><button class="secondary-button" id="endRunButton" type="button">End run</button></div>`);
    $("retryRoundButton").addEventListener("click", retryRound);
    $("endRunButton").addEventListener("click", () => showRunEnded());
  }

  function clearRouteStateForOverlay() {
    resetRoute();
    render();
  }

  function retryRound() {
    state.score = state.roundStartScore;
    state.combo = 0;
    startRound(state.round);
    addLog(`Round ${state.round} restarted from seed ${formatSeed(state.roundSeed)}.`);
  }

  function showRunEnded() {
    state.phase = "runEnded";
    updateBest();
    showOverlay(`<div class="overlay-icon pause">◌</div><p class="eyebrow">RUN LOGGED</p><h2>Orchard systems standing by</h2><p class="overlay-subtitle">You banked the run at round ${state.round}. The seed remains available for another pass.</p><div class="final-stats"><div class="final-stat"><span>SCORE</span><strong>${formatScore(state.score)}</strong></div><div class="final-stat"><span>ROUND</span><strong>${state.round}/8</strong></div><div class="final-stat"><span>BEST COMBO</span><strong>×${multiplier().toFixed(1)}</strong></div></div><div class="overlay-actions"><button class="primary-button" id="playAgainButton" type="button">Play again</button><button class="secondary-button" id="replaySeedButton" type="button">Replay seed</button></div>`);
    wireRunButtons();
  }

  function finishRun() {
    state.phase = "victory";
    updateBest();
    announce(`Orchard restored. Final score ${state.score}.`);
    showOverlay(`<div class="overlay-icon">✦</div><p class="eyebrow">EIGHT ORBITS COMPLETE</p><h2>Orchard restored</h2><p class="overlay-subtitle">The drifting planet has a heartbeat again. Your routes will carry light through the next night.</p><div class="final-stats"><div class="final-stat"><span>FINAL SCORE</span><strong>${formatScore(state.score)}</strong></div><div class="final-stat"><span>BEST COMBO</span><strong>×${multiplier().toFixed(1)}</strong></div><div class="final-stat"><span>BEST DEVICE</span><strong>${formatScore(state.best.score)}</strong></div></div><div class="breakdown">${state.roundHistory.map((entry) => `<div class="breakdown-row"><span>Round ${String(entry.round).padStart(2, "0")}</span><strong>+${entry.score}</strong></div>`).join("")}</div><div class="overlay-actions"><button class="primary-button" id="playAgainButton" type="button">Play again</button><button class="secondary-button" id="replaySeedButton" type="button">Replay seed</button></div>`);
    wireRunButtons();
  }

  function wireRunButtons() {
    $("playAgainButton")?.addEventListener("click", () => startNewRun());
    $("replaySeedButton")?.addEventListener("click", () => startNewRun(state.runSeed));
  }

  function showPause() {
    if (state.phase !== "play") return;
    state.phase = "paused";
    state.lastTick = performance.now();
    showOverlay(`<div class="overlay-icon pause">Ⅱ</div><p class="eyebrow">ORCHARD PAUSED</p><h2>Hold the light</h2><p class="overlay-subtitle">The timer and storm track are paused. Your route preview is safe.</p><div class="overlay-actions"><button class="primary-button" id="resumeButton" type="button">Resume growing</button><button class="secondary-button" id="pauseRestartButton" type="button">Restart round</button></div>`);
    $("resumeButton").addEventListener("click", resumeGame);
    $("pauseRestartButton").addEventListener("click", requestRestart);
    announce("Orchard paused.");
  }

  function resumeGame() {
    if (state.phase !== "paused") return;
    state.phase = "play";
    state.lastTick = performance.now();
    clearOverlay();
    render();
    announce("Orchard resumed.");
  }

  function showOverlay(html) {
    $("overlayCard").innerHTML = html;
    $("overlay").hidden = false;
    requestAnimationFrame(() => $("overlayCard").querySelector("button")?.focus());
  }

  function clearOverlay() {
    $("overlay").hidden = true;
    $("overlayCard").innerHTML = "";
  }

  function requestRestart() {
    if (state.phase === "paused") {
      clearOverlay();
      state.phase = "play";
    }
    if (state.phase !== "play") return;
    if (state.historicalRoutes.length || state.score !== state.roundStartScore) {
      state.confirmAction = restartRound;
      $("confirmModal").hidden = false;
      $("cancelConfirmButton").focus();
    } else restartRound();
  }

  function restartRound() {
    $("confirmModal").hidden = true;
    state.score = state.roundStartScore;
    state.combo = 0;
    startRound(state.round);
    addLog(`Round ${state.round} restarted. Same seed, clean route.`);
    announce(`Round ${state.round} restarted with the same seed.`);
  }

  function togglePause() {
    if (state.phase === "play") showPause();
    else if (state.phase === "paused") resumeGame();
  }

  function moveFocus(index, dr, dc) {
    if (!state.board) return;
    const { row, col } = rowCol(index, state.board.size);
    const nextRow = Math.max(0, Math.min(state.board.size - 1, row + dr));
    const nextCol = Math.max(0, Math.min(state.board.size - 1, col + dc));
    const next = nextRow * state.board.size + nextCol;
    state.lastFocusedIndex = next;
    focusTile(next);
  }

  function handleKeydown(event) {
    if (event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); togglePause(); return; }
    if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); requestRestart(); return; }
    if (event.key === "Escape") {
      if (!$("settingsPanel").hidden) { closeSettings(); return; }
      if (!$("confirmModal").hidden) { closeConfirm(); return; }
      if (state.phase === "play" && state.routeActive) { event.preventDefault(); cancelRoute(); }
      return;
    }
    if (state.phase !== "play") return;
    const tile = event.target.closest?.(".tile");
    if (!tile) return;
    const index = Number(tile.dataset.index);
    state.keyboardFocus = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const direction = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      moveFocus(index, direction[0], direction[1]);
    } else if (event.key === " ") {
      event.preventDefault();
      if (state.routeActive) extendRoute(index); else beginRoute(index);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (state.routeActive) commitRoute(); else beginRoute(index);
    }
  }

  function tileAtPoint(event) {
    return document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".tile");
  }

  function handlePointerDown(event) {
    const tile = event.target.closest?.(".tile");
    if (!tile || state.phase !== "play") return;
    event.preventDefault();
    ensureAudio();
    state.keyboardFocus = false;
    state.ignoreNextClick = true;
    state.pointerId = event.pointerId;
    const index = Number(tile.dataset.index);
    state.lastFocusedIndex = index;
    if (!state.routeActive) beginRoute(index);
    try { $("board").setPointerCapture(event.pointerId); } catch { /* Capture is not available in some embedded browsers. */ }
  }

  function handlePointerMove(event) {
    if (state.pointerId !== event.pointerId || !state.routeActive) return;
    event.preventDefault();
    const tile = tileAtPoint(event);
    if (tile) extendRoute(Number(tile.dataset.index));
  }

  function handlePointerUp(event) {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;
    if (state.routeActive) commitRoute();
  }

  function handleTileClick(event) {
    if (state.ignoreNextClick) { state.ignoreNextClick = false; return; }
    const tile = event.target.closest?.(".tile");
    if (!tile || state.phase !== "play") return;
    const index = Number(tile.dataset.index);
    if (state.routeActive) extendRoute(index); else beginRoute(index);
  }

  function updateStorm() {
    const track = state.board?.movingTrack || [];
    if (!track.length) return;
    state.stormCursor = (state.stormCursor + 1) % track.length;
    state.board.dynamicStormIndex = track[state.stormCursor];
    state.board.forecastIndex = track[(state.stormCursor + 1) % track.length];
    if (state.routeActive && state.route.includes(state.board.dynamicStormIndex)) state.routeInvalid = "The storm shifted into your route.";
    addLog(`Storm track shifted toward ${labelCoord(state.board.forecastIndex)}.`);
    announce(`Storm shifted. Next forecast tile is ${labelCoord(state.board.forecastIndex)}.`);
    playTone(105, 0.24, "sine", 0.012);
    render();
  }

  function tick(now) {
    const delta = Math.min(0.5, Math.max(0, (now - state.lastTick) / 1000));
    state.lastTick = now;
    if (state.phase !== "play") return;
    if (state.timerMax) {
      state.timer = Math.max(0, state.timer - delta);
      if (state.timer <= 0) {
        showLoss("The night storm reached the orchard.");
        return;
      }
    }
    state.stormElapsed += delta;
    if (config().movers && state.stormElapsed >= 6) {
      state.stormElapsed = 0;
      updateStorm();
      return;
    }
    if (Math.floor(state.timer * 2) % 2 === 0 || !state.timerMax) renderUI();
  }

  function ensureAudio() {
    if (state.settings.muted) return;
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try { state.audioContext = new AudioContextClass(); } catch { return; }
    }
    if (state.audioContext.state === "suspended") state.audioContext.resume().catch(() => {});
    syncMusic();
  }

  function playTone(frequency, duration, type = "sine", volume = 0.02, delay = 0) {
    if (state.settings.muted || !state.settings.effects || !state.audioContext) return;
    try {
      const context = state.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + duration + 0.03);
    } catch { /* Audio is an enhancement, never a gameplay dependency. */ }
  }

  function syncMusic() {
    if (!state.audioContext) return;
    if (state.settings.music && !state.settings.muted && !state.ambient) {
      try {
        const oscillator = state.audioContext.createOscillator();
        const gain = state.audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 164.81;
        gain.gain.value = 0.006;
        oscillator.connect(gain).connect(state.audioContext.destination);
        oscillator.start();
        state.ambient = { oscillator, gain };
      } catch { /* Optional audio. */ }
    } else if ((!state.settings.music || state.settings.muted) && state.ambient) {
      try { state.ambient.gain.gain.exponentialRampToValueAtTime(0.0001, state.audioContext.currentTime + 0.2); state.ambient.oscillator.stop(state.audioContext.currentTime + 0.25); } catch { /* Already stopped. */ }
      state.ambient = null;
    }
  }

  function updateSettingsInputs() {
    $("masterMuteToggle").checked = Boolean(state.settings.muted);
    $("musicToggle").checked = Boolean(state.settings.music);
    $("effectsToggle").checked = Boolean(state.settings.effects);
    $("highContrastToggle").checked = Boolean(state.settings.highContrast);
    $("reducedMotionToggle").checked = Boolean(state.settings.reducedMotion);
  }

  function saveSettings() {
    saveJSON(STORAGE.settings, state.settings);
    render();
    syncMusic();
  }

  function openSettings() { $("settingsPanel").hidden = false; $("settingsButton").setAttribute("aria-expanded", "true"); $("highContrastToggle").focus(); }
  function closeSettings() { $("settingsPanel").hidden = true; $("settingsButton").setAttribute("aria-expanded", "false"); $("settingsButton").focus(); }
  function closeConfirm() { $("confirmModal").hidden = true; state.confirmAction = null; $("restartButton").focus(); }

  function bindEvents() {
    $("board").addEventListener("pointerdown", handlePointerDown);
    $("board").addEventListener("pointermove", handlePointerMove);
    $("board").addEventListener("click", handleTileClick);
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    document.addEventListener("keydown", handleKeydown);
    $("pauseButton").addEventListener("click", togglePause);
    $("restartButton").addEventListener("click", requestRestart);
    $("settingsButton").addEventListener("click", () => $("settingsPanel").hidden ? openSettings() : closeSettings());
    $("closeSettingsButton").addEventListener("click", closeSettings);
    $("cancelConfirmButton").addEventListener("click", closeConfirm);
    $("acceptConfirmButton").addEventListener("click", () => { const action = state.confirmAction; state.confirmAction = null; $("confirmModal").hidden = true; action?.(); });
    $("masterMuteToggle").addEventListener("change", (event) => { state.settings.muted = event.target.checked; saveSettings(); });
    $("musicToggle").addEventListener("change", (event) => { state.settings.music = event.target.checked; ensureAudio(); saveSettings(); });
    $("effectsToggle").addEventListener("change", (event) => { state.settings.effects = event.target.checked; ensureAudio(); saveSettings(); });
    $("highContrastToggle").addEventListener("change", (event) => { state.settings.highContrast = event.target.checked; saveSettings(); });
    $("reducedMotionToggle").addEventListener("change", (event) => { state.settings.reducedMotion = event.target.checked; saveSettings(); });
    window.addEventListener("blur", () => { /* Focus changes never pause automatically. */ });
  }

  bindEvents();
  state.best = loadJSON(STORAGE.best, state.best);
  startNewRun();
  window.setInterval(() => tick(performance.now()), 250);
})();
