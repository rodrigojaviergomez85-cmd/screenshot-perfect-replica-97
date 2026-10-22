"""Browser regressions for Boosters via the visible Compact mode (same components as the floating window).
Run: python3 e2e/boosters_regressions.py (dev server on http://localhost:8080). Exits non-zero on failure."""
import asyncio, json, datetime, sys
from playwright.async_api import async_playwright

U = "http://localhost:8080"; KEY = "fair-turns-classes"; DAY = datetime.date.today().isoformat()
NAMES = ["Ana", "Beto", "Maximiliano Alejandro de la Fuente Rodríguez"]
SEED = {"lastId": "c1", "classes": [{"id": "c1", "name": "Test", "day": DAY, "round": 1, "updatedAt": 1,
        "students": [{"id": n, "name": n, "total": 0, "roundsCompleted": 0, "doneThisRound": False} for n in NAMES]}]}
fails = []
def check(name, ok, info=""):
    print(("PASS " if ok else "FAIL ") + name, info); ok or fails.append(name)

async def state(pg):
    c = json.loads(await pg.evaluate(f"localStorage.getItem('{KEY}')"))["classes"][0]
    return {s["name"]: s["total"] for s in c["students"]}, c.get("pending")

async def timer(pg): return await pg.get_by_label("Time remaining").first.get_attribute("aria-label")
NEXT = "Next — confirms the current turn"

async def open_booster(pg, label):
    await pg.get_by_role("button", name="Sonidos").first.click(); await pg.wait_for_timeout(300)
    check("panel opens on Boosters", await pg.get_by_role("tab", selected=True).inner_text() == "Boosters")
    await pg.get_by_role("button", name=label).click()
    await pg.get_by_role("button", name="Start", exact=True).click(); await pg.wait_for_timeout(600)

async def run(b, width):
    pg = await (await b.new_context(viewport={"width": width, "height": 800})).new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(U); await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(SEED))})")
    await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.get_by_text("Test", exact=True).first.click(); await pg.wait_for_timeout(600)
    await pg.locator('button[title="Pick Ana"]').first.click(); await pg.wait_for_timeout(400)
    await pg.get_by_role("button", name="Compact mode").click(); await pg.wait_for_timeout(500)
    w = f"[{width}px]"
    before = await state(pg)

    # Start -> class timer paused, P ignored, Pause/Resume, Finish returns to controls, nothing credited.
    await open_booster(pg, "Move & Freeze, 30 segundos")
    t1 = await timer(pg); await pg.keyboard.press("p"); await pg.wait_for_timeout(2200)
    check(f"{w} class timer frozen during booster, P ignored", await timer(pg) == t1, t1)
    await pg.get_by_role("button", name="Pause", exact=True).click(); await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Resume", exact=True).click(); await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Finish").click(); await pg.wait_for_timeout(400)
    check(f"{w} Finish returns to controls", await pg.get_by_role("tablist").count() == 0)
    check(f"{w} lifecycle keeps student, pending, totals", await state(pg) == before, str(await state(pg)))
    check(f"{w} class still paused after finish", await timer(pg) == t1)

    # Tab switch stops the booster.
    await open_booster(pg, "Copy My Beat, 20 segundos")
    check(f"{w} paused-turn indicator", await pg.get_by_text("Turno en pausa").count() == 1)
    await pg.get_by_role("tab", name="Mi música").click(); await pg.wait_for_timeout(300)
    check(f"{w} tab switch stops booster", await pg.get_by_text("Turno en pausa").count() == 0)

    # X during booster: stops it, no tally change.
    await pg.get_by_role("tab", name="Boosters").click()
    await pg.get_by_role("button", name="Opposite Challenge, 30 segundos").click()
    await pg.get_by_role("button", name="Start", exact=True).click(); await pg.wait_for_timeout(400)
    await pg.get_by_role("button", name="Skip this turn").last.click(); await pg.wait_for_timeout(500)
    totals, pending = await state(pg)
    check(f"{w} X during booster: no tally change, booster stopped", totals == before[0] and await pg.get_by_text("Turno en pausa").count() == 0, str(totals))

    # NEXT during booster credits the shown student exactly once.
    shown = pending["normal"]["id"] if pending and pending.get("normal") else None
    await pg.get_by_role("button", name="Opposite Challenge, 30 segundos").click() if await pg.get_by_role("button", name="Opposite Challenge, 30 segundos").count() else await pg.get_by_role("button", name="Volver a boosters").click()
    if await pg.get_by_role("button", name="Start", exact=True).count() == 0:
        await pg.get_by_role("button", name="Opposite Challenge, 30 segundos").click()
    await pg.get_by_role("button", name="Start", exact=True).click(); await pg.wait_for_timeout(400)
    await pg.get_by_role("button", name=NEXT).last.click(); await pg.wait_for_timeout(500)
    totals2, _ = await state(pg)
    check(f"{w} NEXT during booster credits once", shown and sum(totals2.values()) == 1 and totals2[shown] == 1, str(totals2))
    await pg.screenshot(path=f"/tmp/boosters_{width}.png")
    check(f"{w} no page errors", not errs, str(errs))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for width in (1280, 320): await run(b, width)
        await b.close()
    sys.exit(1 if fails else 0)

asyncio.run(main())
