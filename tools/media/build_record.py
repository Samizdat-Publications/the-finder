"""data/record.json: the record's timeline (M2 step 2, D-A17).

Reads titles from tools/sources.json (Ozma track titles), durations from the decoded WebM files (exact:
decoded sample count / 48000), bytes and SHA-256 from the files. Performers and origins are NASA's
music table, copied from https://science.nasa.gov/mission/voyager/golden-record-contents/sounds/
(section "Music from Earth", fetched 2026-10-15); NASA's wording is kept verbatim.
Run: python -P tools/media/build_record.py
"""
import hashlib, json, os, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUD = os.path.join(ROOT, "public", "media", "audio")
NASA_URL = "https://science.nasa.gov/mission/voyager/golden-record-contents/sounds/"

# (origin, composition, artist(s), NASA length) in NASA's order = music number 1..27 = Ozma tracks 05..31
NASA = [
 ("Germany", "Bach, Brandenburg Concerto No. 2 in F. First Movement", "Munich Bach Orchestra, Karl Richter, conductor", "4:40"),
 ("Java", "court gamelan, \"Kinds of Flowers\"", "recorded by Robert Brown", "4:43"),
 ("Senegal", "percussion", "recorded by Charles Duvelle", "2:08"),
 ("Zaire", "Pygmy girls' initiation song", "recorded by Colin Turnbull", "0:56"),
 ("Australia", "Aborigine songs, \"Morning Star\" and \"Devil Bird\"", "recorded by Sandra LeBrun Holmes", "1:26"),
 ("Mexico", "\"El Cascabel\"", "performed by Lorenzo Barcelata and the Mariachi M\u00e9xico", "3:14"),
 ("United States", "\"Johnny B. Goode\"", "written and performed by Chuck Berry", "2:38"),
 ("New Guinea", "men's house song", "recorded by Robert MacLennan", "1:20"),
 ("Japan", "shakuhachi, \"Tsuru No Sugomori\" (\"Crane's Nest,\")", "performed by Goro Yamaguchi", "4:51"),
 ("Germany", "Bach, \"Gavotte en rondeaux\" from the Partita No. 3 in E major for Violin", "performed by Arthur Grumiaux", "2:55"),
 ("Austria", "Mozart, The Magic Flute, Queen of the Night aria, no. 14", "Edda Moser, soprano. Bavarian State Opera, Munich, Wolfgang Sawallisch, conductor", "2:55"),
 ("Georgia", "Georgian S.S.R., chorus, \"Tchakrulo\"", "collected by Radio Moscow", "2:18"),
 ("Peru", "panpipes and drum", "collected by Casa de la Cultura, Lima", "0:52"),
 ("United States", "\"Melancholy Blues\"", "performed by Louis Armstrong and his Hot Seven", "3:05"),
 ("Azerbaijan", "Azerbaijan S.S.R., bagpipes", "recorded by Radio Moscow", "2:30"),
 ("Russia", "Stravinsky, Rite of Spring, Sacrificial Dance", "Columbia Symphony Orchestra, Igor Stravinsky, conductor", "4:35"),
 ("Germany", "Bach, The Well-Tempered Clavier, Book 2, Prelude and Fugue in C, No.1.", "Glenn Gould, piano", "4:48"),
 ("Germany", "Beethoven, Fifth Symphony, First Movement", "the Philharmonia Orchestra, Otto Klemperer, conductor", "7:20"),
 ("Bulgaria", "\"Izlel je Delyo Hagdutin\"", "sung by Valya Balkanska", "4:59"),
 ("United States", "Navajo Indians, Night Chant", "recorded by Willard Rhodes", "0:57"),
 ("United Kingdom", "Holborne, Paueans, Galliards, Almains and Other Short Aeirs, \"The Fairie Round\"", "performed by David Munrow and the Early Music Consort of London", "1:17"),
 ("Solomon Islands", "panpipes", "collected by the Solomon Islands Broadcasting Service", "1:12"),
 ("Peru", "wedding song", "recorded by John Cohen", "0:38"),
 ("China", "ch'in, \"Flowing Streams\"", "performed by Kuan P'ing-hu", "7:37"),
 ("India", "raga, \"Jaat Kahan Ho\"", "sung by Surshri Kesar Bai Kerkar", "3:30"),
 ("United States", "\"Dark Was the Night\"", "written and performed by Blind Willie Johnson", "3:15"),
 ("Germany", "Beethoven, String Quartet No. 13 in B flat, Opus 130, Cavatina", "performed by Budapest String Quartet", "6:37"),
]
assert len(NASA) == 27
SIDE_BREAK_AFTER_MUSIC = 11


def info(path):
    data = open(path, "rb").read()
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-acodec", "pcm_s16le", "-ar", "48000", "-ac", "2", "-"],
                         capture_output=True, check=True).stdout
    return len(data), hashlib.sha256(data).hexdigest(), round(len(pcm) / 4 / 48000, 3)


def item(iid, kind, mnum, title, performer, origin, fname, source, nasa_title=None, nasa_len=None):
    b, sha, dur = info(os.path.join(AUD, fname))
    d = {"id": iid, "kind": kind, "musicNumber": mnum, "title": title, "performer": performer, "origin": origin}
    if nasa_title is not None:
        d["nasaTitle"] = nasa_title
        d["nasaLengthS"] = int(nasa_len.split(":")[0]) * 60 + int(nasa_len.split(":")[1])
    d.update({"durationS": dur, "file": "media/audio/" + fname, "bytes": b, "sha256": sha, "source": source})
    return d


def main():
    src = {s["id"]: s for s in json.load(open(os.path.join(ROOT, "tools", "sources.json")))["sources"]}
    ttl = lambda n: src[f"ozma-cd-{n:02d}"]["title"]
    items = {"pictures": item("pictures", "pictures", None, "Encoded images (the 1977 image tape, both channels)", None, None, "pictures.webm", "image-tape")}
    kinds = {1: "greeting", 2: "greeting", 3: "greeting", 4: "sounds"}
    for n in range(1, 32):
        nn = f"{n:02d}"
        if n <= 4:
            items[nn] = item(f"ozma-{nn}", kinds[n], None, ttl(n), None, None, nn + ".webm", "ozma-cd-" + nn)
        else:
            m = n - 4
            o, comp, art, ln = NASA[m - 1]
            items[nn] = item(f"ozma-{nn}", "music", m, ttl(n), art, o, nn + ".webm", "ozma-cd-" + nn, comp, ln)
    side1 = [items["pictures"]] + [items[f"{n:02d}"] for n in range(1, 5 + SIDE_BREAK_AFTER_MUSIC)]
    side2 = [items[f"{n:02d}"] for n in range(5 + SIDE_BREAK_AFTER_MUSIC, 32)]
    tot = lambda s: round(sum(i["durationS"] for i in s), 3)
    rec = {
        "meta": {
            "about": "The record's timeline: which audio file plays what, in record order, on which side.",
            "sources": {
                "titles": "Ozma Records 2017 track titles (tools/sources.json, sources ozma-cd-01 to ozma-cd-31)",
                "performersAndOrigins": NASA_URL + " (section 'Music from Earth', NASA Science, fetched 2026-10-15); wording verbatim, in the fields performer, origin and nasaTitle",
            },
            "durationNote": "durationS is the exact length of the shipped WebM (decoded samples / 48000). Ozma tracks include their gaps, so they run a few seconds longer than NASA's nasaLengthS.",
            "encoding": "Opus about 160 kbps VBR, 48 kHz stereo in WebM; pictures.webm is the tape at its header rate (384 kHz = the record's speed) resampled with soxr",
            "sideDurationsS": {"1": tot(side1), "2": tot(side2)},
            "script": "tools/media/build_record.py",
        },
        "sideBreak": {"afterMusic": SIDE_BREAK_AFTER_MUSIC, "basis": "D-A17", "inference": True, "alternatives": [9, 10, 12]},
        "sides": [
            {"side": 1, "faces": "the spacecraft", "items": side1},
            {"side": 2, "faces": "outward", "items": side2},
        ],
    }
    json.dump(rec, open(os.path.join(ROOT, "data", "record.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("side1", tot(side1), "side2", tot(side2), "items", len(side1) + len(side2))


if __name__ == "__main__":
    main()
