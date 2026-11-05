"""Gold news check: scheduled high-impact USD events (blackout window) + headline tone.

  python news.py                      # fetch calendar + headlines (needs internet)
  python news.py --blackout-before 30 --blackout-after 30

Sources (UNOFFICIAL, free, may change or rate-limit; verify before relying on them):
  * calendar JSON: https://nfs.faireconomy.media/ff_calendar_thisweek.json
  * headlines:     Google News RSS search for gold / XAUUSD
Headline tone is a crude keyword count, NOT sentiment analysis. The useful part is the
blackout check: do not open new gold trades right before CPI, NFP, FOMC, Powell speeches etc.
"""
import argparse
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
NEWS_URL = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
BULL = ["rally", "surge", "record high", "safe haven", "rate cut", "dovish", "weaker dollar", "geopolitical", "jumps", "gains"]
BEAR = ["slump", "falls", "drops", "rate hike", "hawkish", "stronger dollar", "strong dollar", "sell-off", "slides", "retreats"]


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "kronos-tools/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_events(raw):
    """-> list of dict(title, country, impact, time(utc aware), forecast, previous)."""
    out = []
    for e in json.loads(raw):
        try:
            t = datetime.fromisoformat(e["date"]).astimezone(timezone.utc)
        except (KeyError, ValueError):
            continue
        out.append({"title": e.get("title", ""), "country": e.get("country", ""), "impact": e.get("impact", ""),
                    "time": t, "forecast": e.get("forecast", ""), "previous": e.get("previous", "")})
    return out


def gold_events(events, countries=("USD",), impacts=("High",)):
    return sorted((e for e in events if e["country"] in countries and e["impact"] in impacts), key=lambda e: e["time"])


def blackout(events, now, before_min=30, after_min=30):
    """Events whose [time - before, time + after] window contains `now`; plus the next upcoming event."""
    active = [e for e in events
              if e["time"] - timedelta(minutes=before_min) <= now <= e["time"] + timedelta(minutes=after_min)]
    nxt = next((e for e in events if e["time"] > now), None)
    return active, nxt


def parse_headlines(raw):
    root = ET.fromstring(raw)
    return [i.findtext("title", "") for i in root.iter("item")]


def tone(headlines):
    b = sum(any(k in h.lower() for k in BULL) for h in headlines)
    r = sum(any(k in h.lower() for k in BEAR) for h in headlines)
    return {"bullish_hits": b, "bearish_hits": r, "of": len(headlines)}


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--blackout-before", type=int, default=30)
    a.add_argument("--blackout-after", type=int, default=30)
    a.add_argument("--headlines", type=int, default=10)
    a = a.parse_args()
    now = datetime.now(timezone.utc)

    try:
        ev = gold_events(parse_events(fetch(CAL_URL)))
        active, nxt = blackout(ev, now, a.blackout_before, a.blackout_after)
        print("CALENDAR (high-impact USD, UTC)")
        for e in ev:
            print(f"  {e['time']:%a %m-%d %H:%M}  {e['title']}  fcst {e['forecast'] or '-'}  prev {e['previous'] or '-'}")
        if active:
            print("\nBLACKOUT: do NOT open new trades now ->", ", ".join(e["title"] for e in active))
        else:
            print("\nno blackout right now")
        if nxt:
            print(f"next event: {nxt['title']} in {(nxt['time'] - now) / timedelta(hours=1):.1f} h")
    except Exception as ex:
        print(f"calendar unavailable ({ex}). Check an economic calendar manually before trading.")

    try:
        q = urllib.parse.quote("gold price OR XAUUSD when:1d")
        hl = parse_headlines(fetch(NEWS_URL.format(q=q)))[:a.headlines]
        print("\nHEADLINES")
        for h in hl:
            print("  -", h)
        print("keyword tone (crude):", tone(hl))
    except Exception as ex:
        print(f"headlines unavailable ({ex})")


if __name__ == "__main__":
    main()
