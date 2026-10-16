# Needs Stewart

Things only Stewart can do, with click-by-click steps. Claude keeps working around them.

## 1. The Gemini spending cap (optional; only for the video critic)

**What happened (2026-10-16):** the AI video critic (Google Gemini, which watches and listens to a
filmed playthrough and reviews it like a player) could not run: Google refused the upload because the
Gemini project has reached its monthly spending cap. Nothing was charged. The build carries on without
it (the blind screenshot critic and your own playtest still run).

**If you want the video critic back** (each review costs about $0.34; the build logs every call in
`C:\Users\stewa\Documents\Claude\Golden Record\docs\SPEND.md` and keeps a soft cap of about $20 per session):

1. Open https://ai.studio/spend in your browser (signed in with the Google account that owns the
   Gemini key used by Noclip).
2. Raise the monthly spending cap by a few dollars (or wait for the monthly reset).
3. Tell the next session "the Gemini cap is raised", or run the review yourself in Windows PowerShell:

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; python -P tools/critic_gemini/critic.py "review/archive/inbox-2026-10-16/2026-10-16T02-53-21-slice"
```

If you would rather not spend on it, do nothing: the build does not depend on it.

## 2. A stray folder to delete or keep (optional, harmless)

**What happened (2026-10-16):** a test script written by the QA helper had a path bug and created a
folder outside the project: `C:\Users\stewa\Documents\Claude\Golden%20Record\` (note the `%20`), holding
five screenshots under `review\`. Copies of the same screenshots are inside the project, so nothing is
lost if it goes. The helper's own delete was refused by the permission system, so it is left for you.

**To delete it** (Windows PowerShell; it only removes that one stray folder):

```powershell
cd "C:\Users\stewa\Documents\Claude"; Remove-Item -LiteralPath "C:\Users\stewa\Documents\Claude\Golden%20Record" -Recurse
```

Or leave it: nothing reads it.

## 3. One short check in Firefox (optional, about 10 minutes, whenever you like)

**Why:** the plan promises Chrome, Edge and Firefox. Chrome and Edge are tested automatically on this PC;
Firefox cannot be, because testing it automatically would mean downloading a separate Firefox build, which
the project's rules do not allow without a reason. A quick look by you covers it.

**What to do:** open https://the-finder.stewartgregerson.workers.dev/play/ in Firefox, with sound on, and
note anything that looks broken or silent:

1. The ring shows; click Arrival; the spacecraft appears under the stars and the scans open.
2. In The Player, the record turns and plays sound when you drop the needle.
3. In The Pictures, a picture develops line by line.
4. In The Map or The Trail, the star chart shows and turns when you drag it.
5. In The Voices, a track plays and its spectrogram shows.

Write what you saw at the top of `C:\Users\stewa\Documents\Claude\Golden Record\docs\STEWART_FEEDBACK.md`
(even "all fine"). Nothing else is needed.
