/**
 * One key per guest, from the address EmDash gives a route (`requestMeta.ip`).
 * Shared by every Wbcom plugin: copy this file byte for byte, change it here first.
 *
 * IPv4 is the address itself. IPv6 is its /64, because one home or phone gets a whole /64
 * and can rotate through it. IPv4 written as IPv6 (::ffff:1.2.3.4) is the IPv4 address, so a
 * guest cannot get a second key by spelling the same address another way. Brackets, a port
 * and a zone id are removed first.
 *
 * Anything that does not parse returns null. The caller treats null like a host that gives no
 * address: the guest is asked to sign in (owner, 2026-10-16). Never fall back to a shared key:
 * every unparseable value would then be one guest.
 */
export function guestKey(raw: string): string | null {
	let ip = raw.trim().toLowerCase();
	const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip);
	if (bracketed) ip = bracketed[1]!;
	else if (/^[\d.]+:\d{1,5}$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
	ip = ip.split("%")[0]!;

	if (!ip.includes(":")) return ipv4(ip);

	const groups = ipv6Groups(ip);
	if (!groups) return null;
	// ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) are IPv4. ::1 and :: stay IPv6.
	const zeroHead = groups.slice(0, 5).every((g) => g === 0);
	if (zeroHead && (groups[5] === 0xffff || (groups[5] === 0 && groups[6] !== 0))) {
		return [groups[6]! >> 8, groups[6]! & 255, groups[7]! >> 8, groups[7]! & 255].join(".");
	}
	return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

function ipv4(ip: string): string | null {
	const parts = ip.split(".");
	if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
	return parts.map(Number).join(".");
}

/** Eight 16-bit groups, or null. Accepts one "::" and a trailing dotted IPv4. */
function ipv6Groups(ip: string): number[] | null {
	const halves = ip.split("::");
	if (halves.length > 2) return null;
	const side = (text: string): number[] | null => {
		if (!text) return [];
		const out: number[] = [];
		const parts = text.split(":");
		for (const [i, part] of parts.entries()) {
			if (i === parts.length - 1 && part.includes(".")) {
				const v4 = ipv4(part);
				if (!v4) return null;
				const [a, b, c, d] = v4.split(".").map(Number) as [number, number, number, number];
				out.push((a << 8) | b, (c << 8) | d);
			} else if (/^[0-9a-f]{1,4}$/.test(part)) out.push(Number.parseInt(part, 16));
			else return null;
		}
		return out;
	};
	const left = side(halves[0]!);
	const right = halves.length === 2 ? side(halves[1]!) : [];
	if (!left || !right) return null;
	if (halves.length === 1) return left.length === 8 ? left : null;
	const gap = 8 - left.length - right.length;
	return gap >= 1 ? [...left, ...Array<number>(gap).fill(0), ...right] : null;
}
