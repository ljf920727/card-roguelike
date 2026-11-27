/** Checks the pip swarm's counts, timing and flight path. */
import test from "node:test";
import assert from "node:assert/strict";
import { createPips, easeInSine, MAX_PIPS, maxPipSize, MIN_PIPS, mulberry32, pipCount, pipEnd, pipState } from "../src/components/swarmMath.js";

const sources = [{ x: 100, y: 500, width: 90, height: 120 }, { x: 220, y: 500, width: 90, height: 120 }];
const target = { x: 900, y: 150 };
const swarm = (count, seed = 7) => createPips({ count, sources, target, random: mulberry32(seed) });

test("more damage means more pips, within sensible bounds", () => {
    assert.equal(pipCount(0), 0);
    assert.equal(pipCount(-5), 0);
    assert.equal(pipCount(1), MIN_PIPS);
    const counts = [6, 15, 30, 45, 75, 110, 777].map(pipCount);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `non-decreasing at ${i}`);
    assert.ok(counts[2] < counts[5], "a big hand shows clearly more pips than a small one");
    assert.equal(pipCount(777), MAX_PIPS);
    assert.ok(counts.every(count => count <= MAX_PIPS));
});

test("easing starts slow and speeds up", () => {
    assert.equal(easeInSine(0), 0);
    assert.ok(Math.abs(easeInSine(1) - 1) < 1e-12);
    assert.ok(easeInSine(0.5) < 0.5);
    assert.ok(easeInSine(0.9) - easeInSine(0.8) > easeInSine(0.2) - easeInSine(0.1), "later steps cover more ground");
});

test("the same seed gives the same swarm, and different seeds differ", () => {
    assert.deepEqual(swarm(12, 3), swarm(12, 3));
    assert.notDeepEqual(swarm(12, 3), swarm(12, 4));
});

test("pips spawn inside their source cards and launch staggered", () => {
    const pips = swarm(20);
    assert.equal(pips.length, 20);
    pips.forEach((pip, index) => {
        const source = sources[index % sources.length];
        assert.ok(pip.x0 >= source.x && pip.x0 <= source.x + source.width);
        assert.ok(pip.y0 >= source.y && pip.y0 <= source.y + source.height);
    });
    const launches = pips.map(pip => pip.launchAt).sort((a, b) => a - b);
    assert.ok(new Set(launches.map(Math.round)).size > 15, "launch times are spread out");
    assert.ok(launches.at(-1) - launches[0] <= 740, "the whole swarm is launched within the spread limit");
    assert.ok(Math.min(...pips.map(pip => pip.duration)) >= 300 && Math.max(...pips.map(pip => pip.duration)) <= 1000);
});

test("arcs vary in size and side", () => {
    const amplitudes = swarm(40).map(pip => pip.amplitude);
    assert.ok(amplitudes.some(value => value > 0) && amplitudes.some(value => value < 0));
    assert.ok(new Set(amplitudes.map(value => Math.round(value))).size > 20);
});

test("a pip hovers, then flies to the target and lands", () => {
    const [pip] = swarm(5);
    assert.equal(pipState(pip, 0).phase === 'hidden' || pip.appearAt === 0, true);
    const hover = pipState(pip, (pip.appearAt + pip.launchAt) / 2);
    assert.equal(hover.phase, "hover");
    assert.ok(Math.abs(hover.x - pip.x0) < 8 && Math.abs(hover.y - pip.y0) < 25, "hovering stays near the card");
    const landed = pipState(pip, pipEnd(pip));
    assert.equal(landed.phase, "done");
    assert.ok(Math.abs(landed.x - pip.x1) < 1e-6 && Math.abs(landed.y - pip.y1) < 1e-6);
    assert.ok(landed.alpha <= 0.01);
});

test("flight accelerates: the last stretch is covered faster than the first", () => {
    const [pip] = swarm(5);
    const at = fraction => pipState(pip, pip.launchAt + pip.duration * fraction);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(distance(at(0.9), at(0.8)) > distance(at(0.2), at(0.1)));
});

test("launching continues from where the hover ended without a jump", () => {
    for (const pip of swarm(10, 11)) {
        const before = pipState(pip, pip.launchAt - 0.001);
        const after = pipState(pip, pip.launchAt + 0.001);
        assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1);
    }
});

test("flight times and sizes vary a lot within one swarm", () => {
    const pips = createPips({ count: 40, amount: 100, sources, target, random: mulberry32(21) });
    const durations = pips.map(pip => pip.duration);
    const sizes = pips.map(pip => pip.size);
    assert.ok(Math.max(...durations) - Math.min(...durations) > 400, "some pips are much faster than others");
    assert.ok(Math.max(...sizes) / Math.min(...sizes) > 2, "some pips are much bigger than others");
});

test("the largest possible pip grows with damage and stays capped", () => {
    assert.ok(maxPipSize(6) < maxPipSize(45) && maxPipSize(45) < maxPipSize(110));
    assert.equal(maxPipSize(777), 14);
    const biggest = amount => Math.max(...createPips({ count: 48, amount, sources, target, random: mulberry32(5) }).map(pip => pip.size));
    assert.ok(biggest(6) <= maxPipSize(6) && biggest(777) <= maxPipSize(777));
    assert.ok(biggest(777) > biggest(6));
});
