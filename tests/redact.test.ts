import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  describe("key=value patterns", () => {
    it("redacts api_key=...", () => {
      const out = redactSecrets("calling endpoint with api_key=abc123def456ghi789");
      expect(out).not.toContain("abc123def456ghi789");
      expect(out).toContain("[REDACTED]");
      expect(out).toMatch(/api_key/i);
    });

    it("redacts API_KEY=... with various separators", () => {
      expect(redactSecrets("API_KEY=mysecret123")).toMatch(/api_key=\[REDACTED\]/i);
      expect(redactSecrets("api-key: mysecret123")).toContain("[REDACTED]");
      expect(redactSecrets('apikey="mysecret123"')).toContain("[REDACTED]");
    });

    it("redacts password / passwd / pwd", () => {
      expect(redactSecrets("password=hunter2")).toContain("[REDACTED]");
      expect(redactSecrets("passwd=hunter2")).toContain("[REDACTED]");
      expect(redactSecrets("pwd=hunter2")).toContain("[REDACTED]");
      expect(redactSecrets("password=hunter2")).not.toContain("hunter2");
    });

    it("redacts token / access_token / secret / bearer", () => {
      expect(redactSecrets("token=abcdefghijklmnopqrst")).toContain("[REDACTED]");
      expect(redactSecrets("access_token=abcdefghijklmnopqrst")).toContain("[REDACTED]");
      expect(redactSecrets("secret=abcdefghijklmnopqrst")).toContain("[REDACTED]");
      expect(redactSecrets("bearer=abcdefghijklmnopqrst")).toContain("[REDACTED]");
    });

    it("does not redact common non-secret words", () => {
      expect(redactSecrets("file=src/foo.ts")).toBe("file=src/foo.ts");
      expect(redactSecrets("count=42")).toBe("count=42");
      expect(redactSecrets("status=running")).toBe("status=running");
    });
  });

  describe("known service tokens", () => {
    it("redacts GitHub tokens (ghp_, ghs_, etc)", () => {
      const ghp = "ghp_" + "A".repeat(36);
      expect(redactSecrets(`token: ${ghp}`)).not.toContain(ghp);
      expect(redactSecrets(`token: ${ghp}`)).toContain("[REDACTED]");
    });

    it("redacts AWS access key IDs (AKIA...)", () => {
      const aws = "AKIA" + "A".repeat(16);
      expect(redactSecrets(`key=${aws}`)).not.toContain(aws);
    });

    it("redacts JWTs (eyJ...eyJ...)", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.signaturepartlong123";
      expect(redactSecrets(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
      expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toContain("[REDACTED]");
    });

    it("redacts Slack tokens (xoxb-, xoxp-)", () => {
      const slack = "xoxb-" + "1234567890-1234567890-abcdefghijklmnopqrst";
      expect(redactSecrets(`SLACK_TOKEN=${slack}`)).not.toContain(slack);
    });

    it("redacts password in DB connection URLs", () => {
      const url = "mysql://user:supersecret@db.example.com:3306/dbname";
      const out = redactSecrets(url);
      expect(out).not.toContain("supersecret");
      expect(out).toContain("user:");
      expect(out).toContain("@db.example.com");
    });
  });

  describe("custom patterns", () => {
    it("applies user-supplied regex patterns", () => {
      const customRe = /MY_INTERNAL_KEY:\s*\S+/g;
      const out = redactSecrets("Found MY_INTERNAL_KEY: foo123", [customRe]);
      expect(out).not.toContain("foo123");
      expect(out).toContain("[REDACTED]");
    });

    it("applies multiple custom patterns", () => {
      const out = redactSecrets("X=aaa Y=bbb", [/X=\S+/g, /Y=\S+/g]);
      expect(out).not.toContain("aaa");
      expect(out).not.toContain("bbb");
    });
  });

  describe("idempotency and safety", () => {
    it("is idempotent (running twice gives same result)", () => {
      const input = "api_key=abc123def456 something else password=hunter2";
      const once = redactSecrets(input);
      const twice = redactSecrets(once);
      expect(once).toBe(twice);
    });

    it("preserves overall message structure", () => {
      const input = "Failed login: api_key=abc123def456 returned 401";
      const out = redactSecrets(input);
      expect(out).toMatch(/Failed login/);
      expect(out).toMatch(/returned 401/);
    });

    it("returns empty string unchanged", () => {
      expect(redactSecrets("")).toBe("");
    });

    it("preserves messages without secrets", () => {
      const input = "PHPUnit 10.5 Tests: 24 Assertions: 30 Failures: 1";
      expect(redactSecrets(input)).toBe(input);
    });
  });
});
