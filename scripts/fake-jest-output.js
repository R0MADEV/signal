#!/usr/bin/env node
// Emits realistic jest output with 2 failures, then exits 1
process.stdout.write(`
FAIL src/auth/AuthService.test.ts
  ● AuthService › login › should return a token

    expect(received).toBe(expected)

    Expected: true
    Received: false

      at Object.<anonymous> (src/auth/AuthService.test.ts:42:5)

  ● AuthService › logout › should clear the session

    TypeError: Cannot read properties of undefined (reading 'clear')

      at Object.<anonymous> (src/auth/AuthService.test.ts:78:12)

FAIL src/user/UserService.test.ts
  ● UserService › getById › should return the user

    expect(received).toEqual(expected)

    Expected: {"id": 1, "name": "Alice"}
    Received: null

      at Object.<anonymous> (src/user/UserService.test.ts:15:5)

Test Suites: 2 failed, 1 passed, 3 total
Tests:       3 failed, 8 passed, 11 total
Snapshots:   0 total
Time:        4.321 s
`);
process.exit(1);
