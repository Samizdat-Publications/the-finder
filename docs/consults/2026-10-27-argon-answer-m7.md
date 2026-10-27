Here is the second-opinion review of the M7 polish changes, ranked by severity across the four categories.

---

### 1. Real bugs

**1.1. [High] `Spotlight` effect depends on `confirmedSet.value`, resetting `centred` and yanking scroll on unrelated state changes**
* **File:** `src/tour/Spotlight.tsx` (lines 116-163)
* **Scenario:** In `Spotlight()`, `const confirmed = confirmedSet.value;` is evaluated during render. Because `confirmedSet` is a Preact `computed(() => new Set(...))` (`src/game/state.ts:103`), it returns a brand-new `Set` reference whenever `game.records.value` changes: including when a player records a **wrong attempt** or requests a **hint** on the current stop. This re-renders `Spotlight`. Because the `useEffect` at line 122 has **no dependency array** (`}, [stopId]);` is missing: wait: line 163 has `}, [stopId]);`, let's check line 120: `const tick = flashTick.value;` is also subscribed in render!).
  Specifically:
  1. Reading `flashTick.value` at line 120 subscribes the component to `flashTick`. Whenever "Show me where" is clicked, `Spotlight` re-renders.
  2. When a stop's `node` is confirmed, `active` becomes `false` and `stopId` becomes `null`. However, while a stop is active, if the user switches chapters away and back (e.g. via "Go back to it" in `Guide.tsx`), or if `Spotlight` remounts, `centred` resets to `false` and `update()` immediately scrolls the column again.
  3. More importantly, in `dimAround()` (`Spotlight.tsx:96`), if `target` is inside `.bench-main`, `while ([...box.children].filter(shown).length === 1)` walks down single-child wrappers. In `Arrival.tsx`, `.ar-viewport` has 5 children (`canvas`, `.ar-markers`, `.ar-scans`, `.ar-panelwrap`, plus conditional `<p class="ar-scene-note">`). While `sceneState === 'loading'`, `<p class="ar-scene-note">` is present and visible, so it gets `data-tour-dim=""`. When `sceneState` transitions to `'ready'`, Preact unmounts `<p class="ar-scene-note">` and mounts the marker `<div>`s. For up to 250 ms (until the next `setInterval` tick), the old `dimmed` set holds detached DOM nodes while newly mounted siblings remain undimmed, causing a visible flash.

**1.2. [Medium] `Spotlight` `dimAround` dims the `Notice` / error banner or sibling panels when `target` is inside `.ar-panelwrap` or `.kpanels`, and leaves stale `data-tour-dim` attributes if Preact recycles DOM nodes across stops**
* **File:** `src/tour/Spotlight.tsx` (lines 87-110, 128-132)
* **Scenario:** When transitioning between two stops in the same chapter (e.g. `pictures.lineTime` -> `pictures.sync`), Preact updates the DOM in place. The cleanup function of the `useEffect` (`setDim(new Set())`) runs *after* paint, and `update()` runs synchronously inside the new effect. However, if a component inside `.bench-main` unmounts and remounts a subtree *between* the 250 ms timer ticks (for example, `MapInstrument` switching `stage.value` from `'map.periods'` to `'map.old'`, which swaps `<LinePanel />` for `<SpinClock />`), the newly mounted elements are not dimmed until the next 250 ms timer tick, causing a 1-frame-to-250ms un-dimmed flash on every stage transition. Listening to a `MutationObserver` on `.bench-main` (or scheduling `update` on `requestAnimationFrame` after state changes) would prevent the flash.

**1.3. [Medium] `StoryScene` and `ArrivalInstrument` leak WebGL contexts and textures if unmounted before `mountEncounter` finishes loading**
* **File:** `src/world/encounter.ts` (lines 136-184, 267-281), `src/tour/StoryScene.tsx` (lines 20-41)
* **Scenario:** On stop 0 (`prologue.voyager`), `StoryScene` mounts and calls `mountEncounter(canvas)`. `mountEncounter` immediately starts `Promise.all([loadData, loadMilkyWay, GLTFLoader.loadAsync])`. If the player immediately clicks **Next** twice to reach stop 3 (`arrival.intro`), `StoryScene` unmounts while `GLTFLoader` is still fetching `voyager.glb`.
  In `encounter.ts:143`:
  ```ts
  if (disposed) {
    mwTex.dispose();
    throw new Error('encounter disposed while loading');
  }
  ```
  1. `gltf` (which was loaded in the same `Promise.all`) is **not** traversed and its geometries/textures/materials are never added to `owned`, so they are never disposed.
  2. The `ready` promise rejects with `'encounter disposed while loading'`. In `StoryScene.tsx:28`, `h.ready.then(..., () => live && setState('failed'))` catches it, **but** anyone awaiting `h.ready` (or if `StoryScene` hadn't attached a rejection handler) would see an unhandled rejection. Worse, the WebGL context created by `new THREE.WebGLRenderer` at line 79 is only freed by `renderer.dispose()` (which does *not* call `WEBGL_lose_context` in three.js), so rapid Back/Next clicks between the prologue (`hub`) and `arrival` repeatedly allocate full WebGL2 contexts + shadow maps + PMREM targets until Chrome hits its 16-context limit and logs `WARNING: Too many active WebGL contexts. Oldest context will be lost.`

**1.4. [Low] `TurningRecord` spin angle jumps to `0` whenever `reducedMotion` or `down` toggles**
* **File:** `src/chapters/epilogue/TurningRecord.tsx` (lines 36-47)
* **Scenario:** In `TurningRecord`, `const t0 = performance.now();` is local to the `useEffect([reduced, down])`. When the player enters Our Frame, `down` starts as `false` while `startRecord()` fetches and decodes the Cavatina track, then flips to `true`. If the needle is lifted and dropped again, or if `reducedMotion` is toggled on and off in Settings, `t0` resets to `performance.now()` and the record's rotation snaps back to `0 deg` instead of continuing from its current angle. Additionally, when `reduced` becomes `true`, the `transform="rotate(...)"` attribute is left at whatever angle the last frame set rather than matching the static still's orientation (or vice versa).

**1.5. [Low] `startSound()` registers global `document` event listeners at module load that can fire multiple times in tests and trigger `detent` on non-instrument sliders**
* **File:** `src/audio/start.tsx` (lines 34-67)
* **Scenario:** `start.tsx` calls `setTimeout(startSound, 0)` at the bottom of the module, and `startSound` is also exported. It attaches five `document.addEventListener(...)` handlers (`pointerover`, `focusin`, `pointerout`, `pointerdown`, `keydown`, `input`) with no guard against being called twice and no cleanup function. Moreover, the `input` listener at line 58 fires `cues.fire({ kind: 'detent', ... })` for *every* `<input type="range">` in the document: including the **Master volume** slider in `SettingsPanel.tsx` (`#set-volume`). Dragging the master volume slider therefore plays a rising-pitch detent synthesizer sound while the user is trying to adjust the volume.

**1.6. [Low] `disposeTree` in `galaxy.ts` / `neighbourhood.ts` is called twice on `root` children on `dispose()`**
* **File:** `src/world/neighbourhood.ts` (lines 365-367), `src/world/chartControls.ts` (lines 382-387)
* **Scenario:** In `neighbourhood.ts:366`, `dispose()` calls `disposeTree(root)` and then `core.dispose()`, which calls `disposeTree(scene)` (which traverses `root` if it wasn't removed: `disposeTree(root)` does `root.removeFromParent()`, so it's safe, though redundant). However, in `galaxy.ts:401`, `dispose()` does *not* call `drop(overlay.region)`: it only calls `if (halos) drop(halos);` and then `core.dispose()`. When `core.dispose()` runs `disposeTree(scene)` before `glowTex.dispose()`, `disposeTree` traverses `overlay.region` and calls `.map?.dispose()` on `glow`'s material, which disposes `glowTex`, and then line 403 calls `glowTex.dispose()` a second time. Double-disposing a `CanvasTexture` in three.js is a no-op today, but asymmetric with `drop()`.

---

### 2. Rule breaks

**2.1. [Medium] Hard Rule 1 (No hand-typed "expected answers" in interface code): `src/tour/script.ts` hand-types `"about 44,000 years ago"` in `portrait.together`'s `why` text**
* **File:** `src/tour/script.ts` (line 459)
* **Scenario:** `PROGRESS.md` (line 19) explicitly claims:
  > *"Step 4, shorter words: the ten longest 'What we just learned' boxes cut to at most about 40 words (from 60; the one hand-typed 'about 44,000 years' became 'tens of thousands of years')"*
  While `arrival.fuelAge` (line 111) was changed to `"tens of thousands of years"`, `portrait.together` (`src/tour/script.ts:459`) still has a hand-typed expected answer in its `why` ("What we just learned") box:
  ```ts
  why: `Four completely different kinds of physics, nuclear decay, spinning dead stars and the machine's own motion, give **one answer**: it left about 44,000 years ago. When clocks that share almost nothing agree, scientists trust the answer.`,
  ```
  All other rules (Rule 2 real image tape, Rule 4 pure `src/science/` and `src/dsp/`, Rule 6 seeded RNG, Rule 13 no em dashes) were checked across the entire repository and have **zero violations**.

---

### 3. Accessibility regressions

**3.1. [Medium] Dimmed controls (`[data-tour-dim]`) fail WCAG 2 AA contrast (4.5:1) while remaining in the tab order and readable by screen readers**
* **File:** `src/tour/tour.css` (lines 151-153), `src/tour/Spotlight.tsx` (lines 87-110)
* **Scenario:** `Spotlight.tsx` sets `data-tour-dim=""` on sibling panels and controls while a tour stop is unfinished, and `tour.css:151` styles them with:
  ```css
  [data-tour-dim] { opacity: 0.45; filter: saturate(0.55); transition: opacity 0.4s, filter 0.4s; }
  ```
  At `opacity: 0.45` over `#0b0a1f`, `--text-dim` (`#9391b8`) blends to `#484764`, giving a contrast ratio of **2.15:1** against `#0b0a1f` (and `--text` `#dcdcf2` drops to **4.38:1**, just under the 4.5:1 AA threshold). `tests/browser/a11y.browser.mjs` did not catch this only because it runs from a *fully confirmed save*, where `active` in `Spotlight.tsx:116` (`!confirmed.has(stop.node)`) is `false`, so `[data-tour-dim]` is never applied during the axe test! If axe is run on an *unfinished* tour stop, `color-contrast` will flag the dimmed text.

**3.2. [Low] `TurningRecord.tsx` ignores `prefers-reduced-motion` OS media query in CSS and relies solely on the in-game `reducedMotion` signal**
* **File:** `src/chapters/epilogue/TurningRecord.tsx` (lines 28-47)
* **Scenario:** In `Hub.tsx` / `shell.css:93`, the new rotating dial ticks include both `:root:not(.calm)` and `@media (prefers-reduced-motion: reduce) { .ringlines .ticks.outer { animation: none !important; } }`. In `TurningRecord.tsx:36`, the `requestAnimationFrame` loop checks `if (reduced || !down) return;` where `reduced = game.settings.value.reducedMotion`. If a user has an existing save in `localStorage` created before they enabled OS-level `prefers-reduced-motion: reduce`, `loadFromStorage` overwrites `game.settings.value.reducedMotion` with `false` from the save (`src/play/main.tsx:39-43`), so `TurningRecord` will spin continuously even though OS reduced motion is active.

---

### 4. Claims in `PROGRESS.md` or `README.md` not supported by the code

**4.1. [Medium] `PROGRESS.md` claims the hand-typed `"about 44,000 years"` in "What we just learned" was removed, and that all "What we just learned" boxes are at most ~40 words**
* **File:** `PROGRESS.md` (lines 18-19), `src/tour/script.ts` (lines 38, 459)
* **Scenario:**
  1. As noted in **2.1**, `portrait.together`'s `why` ("What we just learned") at `src/tour/script.ts:459` still says `"it left about 44,000 years ago"`.
  2. `portrait.together` (`script.ts:459`) is 35 words, and `finale.map` (`script.ts:508`) is 29 words, which do meet the ~40-word target: so only the `"about 44,000 years"` claim is contradicted by `portrait.together`.

**4.2. [Low] `README.md` states "All ten chapters are playable, from Arrival to Our Frame" while `PROGRESS.md` and `docs/plans/M7.md` say the tour has "nine parts"**
* **File:** `README.md` (line 20), `docs/plans/M7.md` (line 42), `src/tour/script.ts` (lines 22-35)
* **Scenario:** `docs/plans/M7.md` step 4 says *"so the 65 steps read as nine parts"*, whereas `PARTS` in `src/tour/script.ts:22-35` actually has **12 parts** (and `PROGRESS.md` line 20 notes `"a 'part 4 of 12' counter beside the part dots"`). In addition, `README.md` line 3 remains `![Status: in development](https://img.shields.io/badge/status-in%20development-d29922)` while line 20 says `Where it stands (2026-10-27): V1.0, polished.`: minor doc drift if V1.0 is shipping.