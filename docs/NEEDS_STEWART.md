# Needs Stewart

Things only Stewart can do, with click-by-click steps. Claude keeps working around them.

## 1. The Gemini credits ran out (needed for the video critic and Argon)

**What happened (2026-10-22, evening):** the video critic and two Gemini 4 Argon reviews ran today (about $2.50 in
all, logged in `C:\Users\stewa\Documents\Claude\Golden Record\docs\SPEND.md`). The last critic run, on a 7.5-minute
film of the whole guided tour, was refused by Google: "Your prepayment credits are depleted." Nothing was charged
for that run. The film is saved and ready.

**To bring the critic back:**

1. Open https://ai.studio/projects in your browser (signed in with the Google account that owns the Gemini key
   used by Noclip), open the project, and add prepaid credit (a few dollars covers many runs; this one is
   estimated at $0.75).
2. Then run this in Windows PowerShell (it reviews the saved film; about two minutes):

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; python -P tools/critic_gemini/critic.py "review/inbox/2026-10-22T22-48-04-tour-film"
```

Or tell the next session "Gemini credits topped up" and it will run it and act on the review.

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
