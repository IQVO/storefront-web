import { describe, expect, it } from "vitest";
import { cleanZip, destinationCookie, destinationOf, postalPrefixOf, readDestination, saveDestination } from "./destination.ts";

describe("postalPrefixOf: the network destination is the first 3 characters of the normalised postal code", () => {
  it.each([
    ["78701", "787"],
    ["78701-1234", "787"],
    [" 786 54 ", "786"],
    ["k1a 0b1", "K1A"],
    ["sw1a-1aa", "SW1"],
    ["7-8", ""],
    ["", ""],
  ])("%j -> %j", (zip, prefix) => expect(postalPrefixOf(zip)).toBe(prefix));

  it("never sends the full ZIP", () => {
    expect(postalPrefixOf("78701")).not.toBe("78701");
    expect(postalPrefixOf("78701")).toHaveLength(3);
  });
});

describe("destination cookie", () => {
  it("keeps only the typed ZIP and its prefix", () => {
    const d = destinationOf("78701");
    expect(d).toEqual({ zip: "78701", prefix: "787" });
    const cookie = destinationCookie(d!);
    expect(cookie).toMatch(/^sf_dest=p%3D787%26z%3D78701; Path=\/; Max-Age=\d+; SameSite=Lax$/);
    expect(readDestination(`a=1; ${cookie.split(";")[0]}`)).toEqual({ zip: "78701", prefix: "787" });
  });
  it("ignores missing, broken or unusable cookies", () => {
    expect(readDestination(null)).toBeNull();
    expect(readDestination("sf_dest=%E0%A4%A")).toBeNull();
    expect(readDestination("sf_dest=z%3D7")).toBeNull();
    expect(destinationOf("x")).toBeNull();
  });
  it("cleans the typed ZIP and writes the cookie in the browser", () => {
    expect(cleanZip(" 78701<script> ")).toBe("78701SCRIP");
    expect(saveDestination("78702")).toEqual({ zip: "78702", prefix: "787" });
    expect(document.cookie).toContain("sf_dest=");
    expect(saveDestination("1")).toBeNull();
  });
});
