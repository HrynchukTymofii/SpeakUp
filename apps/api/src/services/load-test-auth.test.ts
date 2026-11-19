import { describe, expect, it } from "vitest";
import type { AuthProvider } from "./auth-provider.js";
import { signLoadTestToken, withLoadTestAuth } from "./load-test-auth.js";

const SECRET = "load-test-secret-at-least-32-chars!!";

/** Stands in for Clerk: accepts only the literal token "clerk-ok". */
const clerk: AuthProvider = {
  verifySessionToken: async (token) => {
    if (token !== "clerk-ok") throw new Error("invalid clerk token");
    return { clerkUserId: "user_real" };
  },
  getPrimaryEmail: async () => "real@example.com",
};

describe("load-test auth", () => {
  const auth = withLoadTestAuth(clerk, SECRET);

  it("accepts a token it signed and resolves the load-test user", async () => {
    const token = signLoadTestToken("loadtest_42", SECRET);
    await expect(auth.verifySessionToken(token)).resolves.toEqual({
      clerkUserId: "loadtest_42",
    });
    await expect(auth.getPrimaryEmail("loadtest_42")).resolves.toBe("loadtest_42@loadtest.invalid");
  });

  it("still lets real Clerk tokens and users through unchanged", async () => {
    await expect(auth.verifySessionToken("clerk-ok")).resolves.toEqual({
      clerkUserId: "user_real",
    });
    await expect(auth.getPrimaryEmail("user_real")).resolves.toBe("real@example.com");
  });

  it("rejects a token signed with another secret", async () => {
    const forged = signLoadTestToken("loadtest_1", "another-secret-that-is-32-chars-long");
    await expect(auth.verifySessionToken(forged)).rejects.toThrow();
  });

  it("can never be used to act as a real user, even with the right secret", async () => {
    // Clerk ids look like user_…; the load-test path refuses anything but loadtest_….
    const token = signLoadTestToken("user_real", SECRET);
    await expect(auth.verifySessionToken(token)).rejects.toThrow();
  });

  it("rejects a tampered user id", async () => {
    const token = signLoadTestToken("loadtest_1", SECRET).replace("loadtest_1", "loadtest_2");
    await expect(auth.verifySessionToken(token)).rejects.toThrow();
  });
});
