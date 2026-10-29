import { describe, expect, it } from "vitest";
import { boxBefore, boxMove, dueInterval, KNOWN_BOX, nextBox } from "./leitner";

describe("nextBox", () => {
  it("moves up a box when the year is spot on or 1 off", () => {
    expect(nextBox(1, 0)).toBe(2);
    expect(nextBox(2, 1)).toBe(3);
    expect(nextBox(3, -1)).toBe(4);
  });

  it("stops at box 5", () => {
    expect(nextBox(5, 0)).toBe(5);
  });

  it("sends anything further off back to box 1", () => {
    expect(nextBox(4, 2)).toBe(1);
    expect(nextBox(5, -7)).toBe(1);
  });

  it("sends Ken ik niet back to box 1", () => {
    expect(nextBox(3, null)).toBe(1);
  });

  it("counts a new song as box 1", () => {
    expect(boxBefore(null)).toBe(1);
    expect(boxBefore(undefined)).toBe(1);
    expect(boxBefore(4)).toBe(4);
  });

  it("makes a new song known after 4 right answers in a row", () => {
    let box = boxBefore(null);
    for (let i = 0; i < 4; i++) box = nextBox(box, 0);
    expect(box).toBe(KNOWN_BOX);
  });
});

describe("dueInterval", () => {
  it("is 1, 2, 4, 8, 16 sessions for box 1 to 5", () => {
    expect([1, 2, 3, 4, 5].map(dueInterval)).toEqual([1, 2, 4, 8, 16]);
  });
});

describe("boxMove", () => {
  it("says up, down or same", () => {
    expect(boxMove(1, 2)).toBe("up");
    expect(boxMove(4, 1)).toBe("down");
    expect(boxMove(1, 1)).toBe("same");
    expect(boxMove(null, null)).toBe("same");
  });
});
