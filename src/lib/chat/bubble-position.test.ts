import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bubbleSize,
  clampOffset,
  defaultOffset,
  panelSide,
} from "./bubble-position.ts";

const PHONE = { width: 360, height: 740 };
const DESKTOP = { width: 1440, height: 900 };

test("the bubble is smaller where the screen is", () => {
  assert.equal(bubbleSize(360), 48);
  assert.equal(bubbleSize(639), 48);
  assert.equal(bubbleSize(640), 56);
  assert.equal(bubbleSize(1440), 56);
});

test("it rests clear of the mobile bottom navigation", () => {
  // The bug: 16px from the bottom put it on top of the Account tab.
  const withNav = defaultOffset(360, true);
  assert.ok(withNav.bottom >= 80, `clears the nav, got ${withNav.bottom}`);

  // A console has no bottom nav, so it can sit lower.
  assert.ok(defaultOffset(360, false).bottom < 40);
  assert.ok(defaultOffset(1440, true).bottom < 40, "desktop has no bottom nav to clear");
});

test("a dragged bubble cannot be lost off any edge", () => {
  const size = bubbleSize(PHONE.width);
  for (const wild of [
    { right: -500, bottom: -500 },
    { right: 9999, bottom: 9999 },
    { right: 0, bottom: 0 },
  ]) {
    const at = clampOffset(wild, PHONE, size);
    assert.ok(at.right >= 8 && at.right <= PHONE.width - size - 8, `right ${at.right}`);
    assert.ok(at.bottom >= 8 && at.bottom <= PHONE.height - size - 8, `bottom ${at.bottom}`);
  }
});

test("a viewport smaller than the bubble still yields a usable position", () => {
  const at = clampOffset({ right: 100, bottom: 100 }, { width: 40, height: 40 }, 56);
  assert.equal(at.right, 8);
  assert.equal(at.bottom, 8);
});

test("the panel opens away from whichever edge the bubble is on", () => {
  assert.equal(panelSide({ right: 12, bottom: 20 }, PHONE.width), "right");
  assert.equal(panelSide({ right: 300, bottom: 20 }, PHONE.width), "left");
  assert.equal(panelSide({ right: 24, bottom: 24 }, DESKTOP.width), "right");
});
