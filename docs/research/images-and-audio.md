# Research: the record's pictures, its audio, and where to get them

_Planning research, 2026-10-15. Derived list: `docs/research/data/images/image_list_116.txt` (number,
title, channel, frame IDs, colour flag)._

> **Safety: never download from `Adriann6842/voyager-golden-record` or `adriann6842.github.io`.** Its
> README copies another project's, pushes a Windows download and tells users to disable antivirus and
> run as administrator: a typical malware lure. More generally, take data files from the Internet
> Archive items named below and never run downloaded binaries.

## Bottom line

1. **Only one genuine, high-fidelity copy of the image audio is public:** Ozma Records' 2016 transfer of
   the original 1977 Colorado Video image reel, kept in a Sony Music vault. It circulates as
   `384kHzStereo.wav`. Two Internet Archive items hold byte-identical copies (MD5
   `f543349efdcc258e56c9af3baa9d33c8`). Ozma, David Pescovitz and Ron Barry each state its provenance,
   and the signal carries analog-hardware fingerprints a re-synthesis from JPGs would not have. No
   public copy is documented as a re-synthesis.
2. **It is a transfer of the tape the record was made from, not of a pressed disc.** Ozma: "the audio
   was digitally transferred at 15 inches per second as per the reel's box, the correct speed for
   playback and decoding should be twice that." The 384 kHz label restores the cover's timing. Most
   likely a 192 kHz transfer relabelled (inference, section 2).
3. **What the record carries:** 116 catalogue images in 156 frames: 96 single monochrome frames and 20
   colour images stored as 3 frames each. Left channel: images 1-54 (78 frames). Right channel: images
   55-116 (78 frames). Both play at the same time.
4. **No commercial release contains the image audio** (Ozma 2017 LP, CD and download; Warner 1992).
   Timothy Ferris (Ozma book): the 1992 CDs and "internet snippets" came from "7.5-inch-per-second,
   quarter-track analog tape dubs" he gave the team as keepsakes. Ozma's remaster comes from the master
   tapes.
5. **Five text images are missing from the master transfer.** The Ozma book: "added at the last
   minute": 117 is President Carter's statement, 118-121 names of members of Congress. Whether they are
   on the flown records is unknown.

## 1. How the images are encoded

| Item | Finding | Source |
|---|---|---|
| Hardware | Slides projected into a TV camera at Colorado Video (Boulder); their scan converter turned the video into audio on reel-to-reel tape. Valentin Boriakoff found the firm; Frank Drake was technical director. | Ozma SoundCloud text; Pescovitz on the Boing Boing BBS (2017-09-05); Barry 2017 |
| Converter | Colorado Video "Video Compressor Series-262" takes "one sample per TV scan line" (US 4,802,008). US 3,950,607 (Colorado Video) modulates sync-pulse width "in accordance with the sync identification". Linking these patents to the Voyager machine is gourneau's inference. | Google Patents |
| Scan direction | Vertical lines ("traces"). NASA: "512 VERTICAL LINES PER COMPLETE PICTURE". | NASA cover page; diagram in the Ozma book |
| Line time | Cover: binary `101101001100000000000000` = 11,845,632 hydrogen units (0.704 ns) = **8.34 ms**. Measured on the master: **8.326 ms** (0.16% fast). | Barry; gourneau |
| Samples per line (cover / measured) | 384 kHz: 3202 / **3197.4**. 192 kHz: 1601 / 1599. 96 kHz: 801 / 799. 48 kHz: 400 / 400. 44.1 kHz: 368 / **367.2**. The half-speed SoundCloud copy decoded at 44.1 kHz gives 734. | Calculation checked against aizquier (3197 plus 0.4), MarcBaeuerle (367), Malte Gruber (734) |
| Resolution | Ozma book: "grayscale at a resolution of 240 by 512 picture elements". gourneau measured 262.5 sample-and-hold dots per trace (one NTSC field), about 231 active. | Ozma book (2017); gourneau |
| One image | 512 traces x 8.33 ms = **4.26 s**. Frames start every **5.78 s on average** (5.4-7.1 s, from Barry's start table), leaving about 1.5-1.7 s of framing signal between images (gourneau: a periodic framing signal, not hidden data). | Barry (`foodini/voyager`); gourneau |
| Line sync | Each trace opens with a sync/blanking burst: a plateau, a sharp falling edge, a flat shelf. Alternate traces use different pulse widths: peaks alternate about 3100 and 3300 samples apart (Barry), or about 155 vs 45 samples ahead of a shared falling edge (gourneau). **Locking to the falling edge rather than the peak cuts timing error from about +/- 100 samples to about +/- 6.** | Barry; gourneau |
| Start of the image section | About 3.7 s of near-silence, then a tone until about 9.9 s. First frame at **15.63 s (left)** and **16.94 s (right)**; last frames at about 461.5 s and 461.2 s. | aizquier; Ginolhac; Barry's table |
| Interlace | The cover shows "staggered interlace". In the signal alternate traces are offset: Barry hard-coded a 12-sample shift on even traces (about one sample-and-hold dot at 384 kHz). | NASA cover text; Barry; gourneau |
| Polarity | More signal means darker: a straight decode is a negative. | Barry; aizquier; gourneau |
| Colour | 20 images are 3 consecutive frames on the same channel, one per colour separation. Barry and gourneau assemble them as R, G, B. gourneau shows the record alone cannot prove the order because the spectrum slides are too faint. | Ozma book; Barry; gourneau |
| Frames and channels | 156 frames: L000-L077 hold images 1-54 and R000-R077 hold images 55-116. Ozma: "half of the images are encoded in the left channel and half in the right." | Barry's tables; gourneau `data/frame_map.json` (identified visually) |
| Length | The master file is **473.86 s (7:54)**; frames run from 15.6 s to about 466 s. | IA metadata |
| Position on the record | Smithsonian NASM (duplicate disc A19780203000): "The side that faces inward ... contains all the images ... as well as human and cetacean greetings, the sounds of Earth, and a third of the music selections. The outer side consists entirely of musical selections." Wikipedia (unsourced): images "play at the beginning of side one". Cover: 3.6 s per turn; one side 53.8 min by the binary. | airandspace.si.edu; Wikipedia; NASA diagram |
| Orientation | Nothing on the record says which way is up. About 60-66 of the 156 frames need a quarter turn (Barry's hand-made table). | Barry; gourneau |

## 2. Copies of the image audio and their provenance

| Copy | Location | Size | Format and length | Provenance | Verdict |
|---|---|---|---|---|---|
| `384kHzStereo.wav` | https://archive.org/details/voyager.decode (path `Voyager%20Video%20Audio%20%26%20Decode/384kHzStereo.wav`); item "Images Waveform", creators Ron Barry and David Pescovitz, uploaded 2022 by a third party; also holds Barry's essay PDF and code zip | 1,455,685,720 bytes (HEAD-confirmed; audio/x-wav; CORS *; byte ranges supported) | Stereo, 384 kHz label, **32-bit float**; 181,960,704 samples per channel; 473.86 s | Ozma's transfer of the original reel; Pescovitz gave it to Barry; Barry put it on Google Drive; mirrored to IA | **Genuine. Use this.** |
| Same file | https://archive.org/details/voyager_images_384khz (2024-03-02, likely Brandon Moore of amazing-rando); also an IA-made FLAC (525,244,745 bytes) and MP3 (18,679,777 bytes) | Same MD5 | Same | Mirror | Genuine. The FLAC is smaller but its bit depth is unverified |
| Barry's Drive folder | https://drive.google.com/drive/folders/0B0Swx_1rwA6XcFFLc29ncFJSZmM (mirrored in IA item `VoyagerGoldenRecord` as a 2.57 GB zip) | `LeftChannel.raw`, `RightChannel.raw`, 727,842,816 bytes each | float32, one file per channel | Barry's split of the WAV | Genuine (derived) |
| `384kHzStereo.mp3` | IA derivative in `voyager.decode` | 18,679,770 bytes | 44.1 kHz VBR MP3 | Derived | Lossy; many 44.1 kHz decoders use it |
| Ozma SoundCloud "encoded image data" | https://soundcloud.com/user-482195982/voyager-golden-record-encoded-images (2017-09-05) | Streaming only, all rights reserved | AAC 160k, 947.76 s, **half speed** | "This audio file came from the original master tapes from 1977." | Genuine but lossy and slow |
| SoundCloud mirror | https://archive.org/details/soundcloud-340960194 | MP3 15,164,394 bytes (128 kbps) | Half speed | Same bytes as Malte Gruber's `voyager.mp3` | Lossy, half speed |
| NASA JSC tape 495-AAB "Voyager Earth Sounds 1/4in" | https://archive.org/details/Voyager1, `495-AAB_8min10sec.wav` (uploaded by NASA JSC 2011) | 73,154,744 bytes | 48 kHz, 24-bit, **mono**, 492.53 s | A lower-generation dub; Trammell Hudson (2015) judged it "some sort of home copy" with auto-gain | Genuine analog but poor |
| Ozma 2017 LP/CD/download | | | | No image data (Discogs track lists; IA CD rip note) | Not a source |
| Warner New Media 1992 "Murmurs of Earth" (WNM 14022) | | | | Disc 1 track 1 is CD-ROM data: images as files (GRASP `.GL` for DOS, plus Mac), not audio | Not a source |
| NASA releases | | | | No image audio; NASA's SoundCloud has greetings and sounds only | Not a source |

**Evidence the 384 kHz file is genuine:** the source statements (Pescovitz: "we had that original tape
digitized"); the 2x speed error comes from the tape box, which a re-synthesis would not reproduce; wow
and flutter, a 0.16% speed offset, AC-coupling droop and "shadow/anti-shadow", high-pass DC pull,
clicks and dropouts; alternating sync widths matching a Colorado Video patent; a measurable 262.5-dot
sample-and-hold clock (gourneau); visible slide mounts; only 20 colour triplets, matching the Ozma book
(the JPL gallery shows most images in colour, so a re-synthesis from it would not produce this pattern).

**Inference on the original transfer:** 181,960,704 samples at 192 kHz is 947.71 s, the SoundCloud
length, so Ozma very likely transferred at 192 kHz and the header was relabelled 384 kHz to double the
speed without resampling. The 88-byte header fits a libsndfile/Audacity float WAV with a PEAK chunk
(header not read).

**Re-synthesis tools (keep apart from real data):** wpdas/digital-voyager-image-sound, mterenzi/auxide,
LhyYBMQ520/Photo-in-voice all encode images into audio.

## 3. Existing decoders

| Repo or author (year) | Language / browser? | Audio used | Sync method | Colour | Notes |
|---|---|---|---|---|---|
| Trammell Hudson, osresearch/voyager, trmm.net/Voyager (Oct 2015, earliest) | Perl / no | JSC 495-AAB mono | Threshold on strong pulses; about 380 samples per line at 48 kHz | No | Six images, washed out |
| Ron Barry, foodini/voyager (Sept 2017) | C++ / no | 384 kHz master | Frame starts found by hand in Audacity (the only published index of all 156). Within a trace: peak, then trough. 3000-3400 samples per trace, 540 traces x 364 px | Yes, 20 composites | Droop, jitter fudge. Essay: https://boingboing.net/2017/09/05/how-to-decode-the-images-on-th.html |
| aizquier/voyagerimb (Nov 2017, 408 stars) | Python / no | 384 kHz float | Fixed 3197-sample line plus a per-image fractional adjustment and hand-picked offsets | Partial | |
| MalteGruber/voyager-record-decoder (2018) | JavaScript, Web Audio `decodeAudioData`, Canvas / **yes**: https://maltegruber.github.io/voyager-record-decoder | Half-speed SoundCloud MP3 | Local-maximum pulse search, 734 samples per line | No | Needs 44.1 kHz output; first to document the high-pass and DC-pull artifact. Forks: elliottssu (adds music playback), cometsinthesky |
| MarcBaeuerle/Golden-record-images (2023) | TypeScript / **yes**: https://goldenrecord.netlify.app/ | A 44.1 kHz file | 367 samples per line; anchors on the 2-line (734-sample) period to remove slant | RGB | Display speed is not the record's speed |
| amazing-rando/voyager-decoder (2019) | Python / no | 384 kHz WAV | scipy `find_peaks`; row spacing 10 ms (longer than one trace), so it skips lines and repeats rows | Hard-coded indexes | README says triples are B, G, R, but the code treats the first frame as red |
| gourneau/golden-record-images (Aug 2026) | Python reference; TypeScript browser port "in progress" | 384 kHz WAV | Two-parity matched filter locked to the falling edge; per-frame period fit; window 2873 samples; clamp on the sync shelf; droop inverse | Yes, plus Noise2Noise denoising | Browser assets: 96 kHz 16-bit mono FLAC slices, about 530 KB per frame, about 85 MB in all. Single author; claims not independently reviewed |
| Others | mmcc1 (C#, 2018); bnitkin (Pygame, 2018); xieguigang/voyager-1 (R#, 2020); damncabbage (Ruby, RubyConf AU 2020); BillHollatz (MATLAB, 2021); Aurelien Ginolhac / Uni Luxembourg course (R, 2024); fajrulfx (React plus FastAPI, 2026); dicnunz (2026) | | | | |

**Typical artifacts:** slant from a wrong or rounded line period; zigzag doubling from locking to the
peak instead of the falling edge; bright-top, dark-bottom images with trailing shadows (AC coupling);
wavy edges from wow and flutter; inverted polarity; colour ghosting from misregistered frames; skipped
lines when the peak-distance setting exceeds one trace (uni.lu found only 358 lines in image 1); badly
placed frames where content outweighs the sync pulse; rotated images; half-speed copies decoded without
the 2x correction.

**Use for this project:** read Barry's frame-start table and colour and orientation tables
(`foodini/voyager`), gourneau's method write-ups and `data/frame_map.json` / `data/images.json`, and
aizquier's fractional line adjustment. Write our own decoder (reference in Python, product in
TypeScript); copy no code without checking its licence.

## 4. The rest of the record

| Source | Contents | Quality and provenance |
|---|---|---|
| Ozma Records 2017 (2xCD with book; 3xLP box at 33 1/3 rpm with MP3 or FLAC download card) | Everything except the images | "Remastered from the original analog tapes" (Discogs), from the Sony vault where CBS mastered the record; analog artifacts deliberately kept (NPR). CD 16-bit/44.1 kHz; no hi-res found. Unofficial IA FLAC rip of the CD: `voyager-golden-record-cd-ozma` (31 tracks, 111:18, 765 MB) |
| Warner New Media 1992 (2 audio CDs plus CD-ROM) | Greetings, sounds, music; images on the CD-ROM | From keepsake dubs (Ferris); tracks run about 2% long (e.g. Liu Shui 7:48 vs 7:36), suggesting slow dubs. Unofficial IA rip: `murmurs-of-earth-the-voyager-interstellar-record-audio-cd-collection` (6.8 GB) |
| NASA SoundCloud (2015-07-27) | https://soundcloud.com/nasa/sets/golden-record-greetings-to-the (55 tracks, 4:20) and https://soundcloud.com/nasa/sets/golden-record-sounds-of (19 tracks, 9:34) | Downloadable; licence field cc-by-nc. No music, no Waldheim greeting, no UN/whale track. Source tape not stated |

**Record order** (Ozma sequence; durations from the IA FLAC rip, including track gaps; NASA's listed
duration in brackets):
- Encoded images (both channels): 7:54 (master file)
- Waldheim greeting 0:44 | Greetings in 55 languages 3:46 | UN greetings / whale songs 4:04 | Sounds of
  Earth 12:19
- Music:
  1. Bach, Brandenburg Concerto No. 2, first movement: 4:44 [4:40]
  2. Puspawarna (Java): 4:47 [4:43]
  3. Cengunme (Senegal): 2:11 [2:08]
  4. Alima Song (Mbuti, Zaire): 1:01 [0:56]
  5. Barnumbirr / Moikoi (Australia): 1:29 [1:26]
  6. El Cascabel (Mexico): 3:20 [3:14]
  7. Johnny B. Goode: 2:41 [2:38]
  8. Mariuamangi (New Guinea): 1:24 [1:20]
  9. Sokaku-Reibo (Japan): 5:04 [4:51]
  10. Bach, Gavotte en Rondeaux: 2:58 [2:55]
  11. Mozart, Queen of the Night: 3:00 [2:55]
  12. Chakrulo (Georgia): 2:19 [2:18]
  13. Roncadoras and Drums (Peru): 0:55 [0:52]
  14. Melancholy Blues: 3:06 [3:05]
  15. Mugam (Azerbaijan): 2:35 [2:30]
  16. Stravinsky, Rite of Spring: 4:38 [4:35]
  17. Bach, Well-Tempered Clavier BWV 870 (Gould): 4:51 [4:48]
  18. Beethoven, Fifth Symphony, first movement: 8:49 [NASA says 7:20]
  19. Izlel e Delyu (Bulgaria): 5:04 [4:59]
  20. Navajo Night Chant: 1:01 [0:57]
  21. The Fairie Round (Holborne): 1:19 [1:17]
  22. Naranaratana Kookokoo (Solomon Islands): 1:15 [1:12]
  23. Wedding Song (Peru): 0:42 [0:38]
  24. Liu Shui (China): 7:36 [7:37]
  25. Bhairavi (India): 3:34 [3:30]
  26. Dark Was the Night: 3:22 [3:15]
  27. Beethoven, Cavatina (String Quartet No. 13): 6:41 [6:37]
- Music totals 90:26; the whole Ozma programme is 111:18.

**Side layout:** inner side (facing the spacecraft): images, greetings, whale greetings, sounds and "a
third of the music" (Smithsonian); outer side: music only. Images, greetings and sounds take 28:47;
adding about 30 min of music gives about 59 min per side, near the cover's 53.8 min. **The exact break
is unconfirmed:** candidates are after #9 (exactly a third by count), after #11 (where the 1992 CD
changes discs) or after #12 (where the Ozma CD changes discs). Decide in M2, log it in DECISIONS, and
show it as an inference.

## 5. The 116 images as clean files

- **NASA:** https://science.nasa.gov/mission/voyager/golden-record-contents/images/ and
  https://science.nasa.gov/gallery/images-on-the-golden-record/ say "115 images" and show only 48 "due
  to copyright restrictions" (pattern
  `https://science.nasa.gov/wp-content/uploads/2024/03/earth-31326146966-o.gif`, CORS *). The old
  voyager.jpl.nasa.gov pages redirect to missing.html. Pescovitz: JPL's copies were "most likely scanned
  from Murmurs of Earth".
- **JPL 2016 index:** 116 entries with credits, archived at
  http://web.archive.org/web/20161128202312/http://voyager.jpl.nasa.gov/spacecraft/scenes.html
- **Wikimedia Commons:** Category "Images on the Voyager Golden Record" (37 files): GIFs from JPL
  (including `File:Voyager_golden_record_42_Adams...gif`, which is really image 43; 42 is Cape Neddick)
  and 512 x 384 PNGs extracted from the 1992 CD-ROM in 2026 (numbered one lower from somewhere between
  14 and 42, fitting the CD-ROM lacking the one image Sagan could not clear).
- **Best quality:** the Ozma book scans from Drake's original slides (an unofficial 400 MB PDF is on IA).
- **Ordered lists:** Wikipedia "Contents of the Voyager Golden Record" (1-116); the Ozma book's
  captions, which correct several titles (2 "Pulsar map with the Andromeda galaxy"; 44 "A horseman and
  his dog cross the desert" where JPL says "Sand dunes"; 63 "Man from Nicaragua" where JPL says
  Guatemala; 65 "Women in Santiago Atitlan" where JPL says "Andean girls"); machine-readable: gourneau
  `data/images.json`; ours: `data/images/image_list_116.txt`.
- **Colour:** Wikipedia marks 87 source photos as colour, but only 20 are colour-encoded on the record:
  8, 12, 13, 23, 34, 35, 36, 45, 46, 48, 49, 50, 55, 60, 78, 89, 94, 97, 112, 114.
- **Other discrepancies:** counts of 115 (NASA, Library of Congress), 116 (audio, JPL 2016, Ozma), 118
  (Wikipedia, with Carter as 117-118), 121 (Ozma: 117 Carter plus 118-121 Congress), 122 (NASM;
  goldenrecord.org adds statement and credits pages 117-122). gourneau found 14 published
  reproductions that are mirror images of the record.
- **Text items:** Carter statement:
  https://www.presidency.ucsb.edu/documents/voyager-spacecraft-statement-the-president . Ferris etched
  "To the makers of music - all worlds, all times" between the record's takeout grooves. goldenrecord.org
  shows all 116 images and the 31 tracks, with no stated provenance.
- **Copyright:** most photographs and all the music are third-party works; the master WAV carries no
  licence statement. (Stewart has taken responsibility for licensing; it does not shape decisions.)

## Could not confirm

- The 1978 Murmurs of Earth text (lending-only), so no direct quotes from it.
- The exact side 1 / side 2 split of the flown record, and whether the images come before the greetings.
- Whether the record was cut by playing this reel at 2x, or the reel is mislabelled; whether the flown
  discs match the tape exactly.
- Whether the five text images (117-121) are on the flown records, and where.
- Ozma's original sample rate and bit depth (192 kHz inferred); the WAV's format tag (float very
  likely); the bit depth of IA's FLAC derivative.
- Whether JSC 495-AAB is a downmix or a single channel, and its generation.
- Provenance and format of NASA's SoundCloud files; resolution of Ozma's download FLAC.
- Which image was left out of the 1992 CD-ROM.
- The red/blue order of the colour triplets from the record alone.
- gourneau's measurements (field-ID sync, 262.5-dot clock, mirrored plates): single-author 2026 work.
- The cover's 53.8 minutes per side versus NASA's "~1 hour".
