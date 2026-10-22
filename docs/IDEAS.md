# Ideas for after the main version

Things Stewart wants considered once the main version (M6 and M7 of PLAN.md) is complete. Not scheduled;
plan them in a session on xhigh or max effort (the thinking-heavy part; building to the plan can then run on high or medium), starting with a short plan for Stewart to approve. Newest at
the top.

## The younger version (Stewart, 2026-10-16)

A kids' variant of The Finder: the same experience and the same real science, but **fewer steps** to keep
them engaged and a **simpler interface**: mostly on rails, clicking Next, with interactive moments only
where doing it yourself is fun (the circle coming out round, dropping the needle, sweeping the detector for
the hidden spot, colouring the Earth, the whales). **First target: an 8th-grade reading level** (about age
13 to 14).

Starting thoughts (for the planning session, not decisions):
- The guided tour (D-A33, `src/tour/`) already has the shape: a script of stops plus a "Do it for me" action
  per deduction. The younger version could be a second script (for example `src/tour/scripts/young.ts`):
  perhaps 15 to 20 stops instead of 65, most of them story or watch stops that run the real instrument
  while the narration explains, and a handful of do stops chosen for fun.
- A simpler stage for that mode: the instrument big, the guide as a large caption card, the extra panels
  (readouts, notebook, show working) hidden; the alien units probably shown in our units first.
- Keep the hard rules: the pictures still decoded live from the 1977 tape, every number still computed
  from real data; only the amount of explanation and choice changes.
- Check the reading level of the text with a readability measure and a blind read by a critic briefed on
  the age group; Stewart's son (nearly 12) is a natural tester.
- Entry: a third button on the landing page ("For younger explorers"), or a choice at the tour's start.
