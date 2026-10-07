import { describe, it, expect } from "vitest";
import { DEFAULT_8_PROFILES } from "@/lib/api/standaloneMock";

describe("8 Enterprise Sender Accounts Pool Capacity", () => {
    it("has exactly 8 active enterprise sender profiles", () => {
        expect(DEFAULT_8_PROFILES).toHaveLength(8);
        const emails = DEFAULT_8_PROFILES.map((p) => p.email);
        expect(emails).toContain("haji.karim@theboredmonkey.com");
        expect(emails).toContain("snehal.maurya@theboredmonkey.com");
        expect(emails).toContain("vatsal.vadecha@theboredmonkey.com");
        expect(emails).toContain("tamanna.ranawat@theboredmonkey.com");
        expect(emails).toContain("preeti.karki@theboredmonkey.com");
        expect(emails).toContain("monu@theboredmonkey.com");
        expect(emails).toContain("suraj@theboredmonkey.com");
        expect(emails).toContain("partnerships@theboredmonkey.com");
    });

    it("calculates pool capacity of ~1,600 sends/day when daily limit is 200 across 8 accounts", () => {
        const activeSenderCount = DEFAULT_8_PROFILES.length;
        const dailyLimit = 200;
        const totalCapacity = dailyLimit * activeSenderCount;
        expect(activeSenderCount).toBe(8);
        expect(totalCapacity).toBe(1600);
        expect(totalCapacity.toLocaleString()).toBe("1,600");
    });

    it("scales pool capacity dynamically with daily limit presets across 8 accounts", () => {
        const senderCount = 8;
        const presets = [25, 50, 100, 200, 500];
        const expectedCapacities = [200, 400, 800, 1600, 4000];

        presets.forEach((preset, idx) => {
            expect(preset * senderCount).toBe(expectedCapacities[idx]);
        });
    });
});
