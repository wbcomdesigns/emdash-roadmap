import { describe, expect, it } from "vitest";

import { guestKey } from "../src/visitor-key";

describe("guestKey", () => {
	it("keeps IPv4 as the address, without leading zeros or a port", () => {
		expect(guestKey("203.0.113.7")).toBe("203.0.113.7");
		expect(guestKey(" 203.000.113.007 ")).toBe("203.0.113.7");
		expect(guestKey("203.0.113.7:51820")).toBe("203.0.113.7");
	});

	it("gives IPv4 written as IPv6 the same key as plain IPv4", () => {
		const plain = guestKey("203.0.113.7");
		expect(guestKey("::ffff:203.0.113.7")).toBe(plain);
		expect(guestKey("::FFFF:cb00:7107")).toBe(plain);
		expect(guestKey("0:0:0:0:0:ffff:203.0.113.7")).toBe(plain);
		expect(guestKey("[::ffff:203.0.113.7]:443")).toBe(plain);
		expect(guestKey("::203.0.113.7")).toBe(plain);
	});

	it("groups IPv6 by /64 however it is spelled", () => {
		const key = "2001:db8:abcd:12::/64";
		expect(guestKey("2001:db8:abcd:12::1")).toBe(key);
		expect(guestKey("2001:0DB8:abcd:0012:ffff:1:2:3")).toBe(key);
		expect(guestKey("[2001:db8:abcd:12::99]:8080")).toBe(key);
		expect(guestKey("2001:db8:abcd:12::1%eth0")).toBe(key);
		expect(guestKey("2001:db8:abcd:13::1")).not.toBe(key);
	});

	it("keeps loopback and unspecified IPv6 as IPv6", () => {
		expect(guestKey("::1")).toBe("0:0:0:0::/64");
		expect(guestKey("::")).toBe("0:0:0:0::/64");
	});

	it("returns null for anything that does not parse, never a shared key", () => {
		for (const bad of ["", "unknown", "1.2.3", "1.2.3.256", "1.2.3.4.5", "a.b.c.d", "2001:db8::1::2", "2001:db8:1:2:3:4:5:6:7", "12345::1", "::ffff:1.2.3.999", "gggg::1", "[::1"]) {
			expect(guestKey(bad), bad).toBeNull();
		}
	});
});
