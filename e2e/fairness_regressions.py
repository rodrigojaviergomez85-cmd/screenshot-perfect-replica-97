"""Browser regressions for Fair Turns saving/ownership/extra-turn. Run: python3 e2e/fairness_regressions.py
(needs the dev server on http://localhost:8080). Exits non-zero on failure."""
import asyncio, json, datetime, sys
from playwright.async_api import async_playwright

U = "http://localhost:8080"
KEY = "fair-turns-classes"
DAY = datetime.date.today().isoformat()

def seed(ana_total=0, pending=None):
    c = {"id": "c1", "name": "Test", "day": DAY, "round": 1, "updatedAt": 1,
         "students": [{"id": n, "name": n, "total": (ana_total if n == "Ana" else 0), "roundsCompleted": 0,
                       "doneThisRound": n in ("Ana", "Beto") and pending == "Beto"} for n in ["Ana", "Beto", "Carla"]]}
    if pending: c["pending"] = {"normal": {"id": pending, "day": DAY, "earnsRound": True}, "af": None}
    return {"lastId": "c1", "classes": [c]}

fails = []
def check(name, ok, info=""):
    print(("PASS " if ok else "FAIL ") + name, info); ok or fails.append(name)

async def stored(page):
    return json.loads(await page.evaluate(f"localStorage.getItem('{KEY}')"))

def totals(blob): return {s["name"]: s["total"] for s in blob["classes"][0]["students"]}

async def open_class(page):
    await page.get_by_text("Test", exact=True).first.click(); await page.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)

        # 1) Extra-turn decision cannot be bypassed by shortcuts
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}); pg = await ctx.new_page()
        await pg.goto(U); await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seed()))})")
        await pg.reload(); await pg.wait_for_timeout(1200); await open_class(pg)
        await pg.locator('button[title="Pick Ana"]').first.click(); await pg.wait_for_timeout(400)
        await pg.locator('button[title="Pick Beto"]').first.click(); await pg.wait_for_timeout(400)
        await pg.locator('button[title="Pick Ana"]').first.click(); await pg.wait_for_timeout(400)
        check("offer opens", await pg.get_by_role("alertdialog").count() > 0)
        focused = await pg.evaluate("document.activeElement && document.activeElement.textContent")
        check("initial focus is Cancel, not accept", focused == "Cancel", str(focused))
        before = await stored(pg)
        # No programmatic focus change: keys go wherever the dialog put focus.
        for key in ["Space", "x", "p", "t", "Space"]:
            await pg.keyboard.press(key); await pg.wait_for_timeout(350)
        after = await stored(pg)
        check("shortcuts during offer change nothing", totals(after) == totals(before) and after["classes"][0].get("pending") == before["classes"][0].get("pending"), str(totals(after)))
        check("offer still open after Space", await pg.get_by_role("alertdialog").count() > 0)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        check("Escape cancels offer", await pg.get_by_role("alertdialog").count() == 0)
        check("cancel leaves data unchanged", totals(await stored(pg)) == totals(before))
        await pg.locator('button[title="Pick Ana"]').first.click(); await pg.wait_for_timeout(400)
        await pg.keyboard.press("Shift+Tab"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(400)
        s = await stored(pg); c = s["classes"][0]
        check("explicit accept (Shift+Tab, Enter) credits Beto once, Ana pending w/o extra round",
              totals(s) == {"Ana": 1, "Beto": 1, "Carla": 0} and c["pending"]["normal"]["id"] == "Ana" and not c["pending"]["normal"]["earnsRound"], str(totals(s)))
        # Held Space after acceptance: exactly one change.
        await pg.wait_for_timeout(400)
        await pg.keyboard.down("Space")
        for _ in range(4):
            await pg.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',repeat:true,bubbles:true}))"); await pg.wait_for_timeout(350)
        await pg.keyboard.up("Space"); await pg.wait_for_timeout(300)
        s2 = totals(await stored(pg))
        check("held Space after accept = one NEXT", s2 == {"Ana": 2, "Beto": 1, "Carla": 0}, str(s2))
        await ctx.close()

        # 2) Failed read of the classes blob never overwrites it
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}); pg = await ctx.new_page()
        await pg.goto(U); original = json.dumps(seed(1, "Beto"))
        await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(original)})")
        await pg.evaluate("""() => { sessionStorage.setItem('failRead','1'); }""")
        await ctx.add_init_script(f"""(() => {{ const g = Storage.prototype.getItem;
          Storage.prototype.getItem = function (k) {{ if (k === '{KEY}' && window.sessionStorage && g.call(sessionStorage, 'failRead')) throw new Error('boom'); return g.call(this, k); }}; }})()""")
        await pg.reload(); await pg.wait_for_timeout(1500)
        raw = await pg.evaluate(f"(() => {{ sessionStorage.removeItem('failRead'); return localStorage.getItem('{KEY}'); }})()")
        check("failed read keeps stored blob byte-identical", raw == original)
        check("retry state shown", await pg.get_by_role("button", name="Try again").count() == 1)
        await pg.get_by_role("button", name="Try again").click(); await pg.wait_for_timeout(800)
        s = await stored(pg)
        check("retry loads latest saved data", totals(s)["Ana"] == 1 and s["classes"][0]["pending"]["normal"]["id"] == "Beto")
        await pg.evaluate(f"localStorage.setItem('{KEY}', '{{\"classes\":5}}')"); await pg.reload(); await pg.wait_for_timeout(1200)
        check("malformed payload is not replaced", await pg.evaluate(f"localStorage.getItem('{KEY}')") == '{"classes":5}')
        await ctx.close()

        # 3) Two tabs: only the Web Locks owner edits; takeover reloads latest
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}); a = await ctx.new_page()
        await a.goto(U); await a.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seed()))})")
        await a.reload(); await a.wait_for_timeout(1200)
        bb = await ctx.new_page(); await bb.goto(U); await bb.wait_for_timeout(1200)
        check("second tab blocked", "otra pestaña" in await bb.inner_text("main"))
        await open_class(a)
        for _ in range(3):
            await a.keyboard.press("Space"); await a.wait_for_timeout(400)
        t1 = totals(await stored(a))
        await bb.keyboard.press("Space"); await bb.wait_for_timeout(500)
        check("blocked tab cannot change counts", totals(await stored(a)) == t1, str(t1))
        await a.close(); await bb.wait_for_timeout(1200)
        await bb.get_by_role("button", name="Continue here").click(); await bb.wait_for_timeout(800)
        check("takeover keeps latest counts", totals(await stored(bb)) == t1)
        await open_class(bb)
        pend_before = (await stored(bb))["classes"][0]["pending"]["normal"]["id"]
        await bb.keyboard.press("Space"); await bb.wait_for_timeout(500)
        t2 = totals(await stored(bb))
        check("continues from last pending", t2[pend_before] == t1[pend_before] + 1, str(t2))
        await ctx.close()

        # 4) Malformed roster is rejected; legacy key removed only after merged write
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}); pg = await ctx.new_page()
        await pg.goto(U)
        bad = json.dumps({"lastId": "audit", "classes": [{"id": "audit", "name": "Fairness edge", "students": "not-an-array"}]})
        await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(bad)})"); await pg.reload(); await pg.wait_for_timeout(1200)
        check("malformed roster blob untouched", await pg.evaluate(f"localStorage.getItem('{KEY}')") == bad)
        bad2 = json.dumps({"classes": [{"id": "a", "name": "A", "students": [{"id": "s1", "name": "Ana"}, {"id": 5}]}]})
        await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(bad2)})"); await pg.reload(); await pg.wait_for_timeout(1200)
        check("invalid student entry blob untouched", await pg.evaluate(f"localStorage.getItem('{KEY}')") == bad2)
        legacy = json.dumps({"day": DAY, "round": 1, "students": [{"id": "L1", "name": "Lia", "total": 2}]})
        await pg.evaluate(f"localStorage.removeItem('{KEY}'); localStorage.setItem('fair-turns-class', {json.dumps(legacy)})")
        await pg.reload(); await pg.wait_for_timeout(1500)
        merged = await pg.evaluate(f"localStorage.getItem('{KEY}')"); leg = await pg.evaluate("localStorage.getItem('fair-turns-class')")
        check("legacy merged then removed", merged is not None and "Lia" in merged and leg is None)
        await ctx.close()

        # 5) Old saves without recency/carry fields load; new fields persist and survive reload
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}); pg = await ctx.new_page()
        await pg.goto(U); old = seed(); old["classes"][0]["normal"] = {"day": DAY, "last": "Ana", "avoid": None}
        await pg.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(old))})")
        await pg.reload(); await pg.wait_for_timeout(1200); await open_class(pg)
        for _ in range(2):
            await pg.keyboard.press("Space"); await pg.wait_for_timeout(400)
        n = (await stored(pg))["classes"][0]["normal"]
        check("legacy normal memory migrated with prev/carry", "prev" in n and isinstance(n.get("carry"), list), str(n))
        await pg.reload(); await pg.wait_for_timeout(1200)
        check("recency memory survives reload", (await stored(pg))["classes"][0]["normal"]["prev"] == n["prev"])
        await ctx.close(); await b.close()
    sys.exit(1 if fails else 0)

asyncio.run(main())
