#!/usr/bin/env node
// Emits realistic cypress output with 2 failures, then exits 1
process.stdout.write(`
  (Running: cypress/e2e/auth/login.cy.ts, 1 of 3)


  Auth › Login
    1) should redirect to dashboard after login
    ✓ should show error on invalid credentials (320ms)


  1 failing

  1) Auth › Login should redirect to dashboard after login:
       AssertionError: expected '/dashboard' to equal '/home'
      at Context.<anonymous> (cypress/e2e/auth/login.cy.ts:25:7)


  (Running: cypress/e2e/user/profile.cy.ts, 2 of 3)


  User › Profile
    2) should display user name
    ✓ should allow editing email (210ms)


  1 failing

  2) User › Profile should display user name:
       AssertionError: expected '' to equal 'Alice'
      at Context.<anonymous> (cypress/e2e/user/profile.cy.ts:18:5)


  (Run Finished)

  Spec                              Tests  Passing  Failing
  login.cy.ts                       2      1        1
  profile.cy.ts                     2      1        1

  2 of 2 specs failed.
`);
process.exit(1);
