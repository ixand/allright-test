A Playwright spec was written for the manual test case below, and it failed. Decide whether the spec or
the application is wrong, then reply.

- The spec is wrong (a locator, a missing screen check, the step order, a syntax or type error, an ESLint
  problem): reply with the corrected spec. A spec that was not run is always wrong in this sense.
- The spec follows the case and the application contradicts an expected result of the case: reply with
  one line and nothing else:
  APP_BUG: <what the case expects, and what the application shows instead>

A corrected spec keeps every assertion and every expected value of the case. Deleting or commenting out
an assertion, loosening it (`toContainText`, a regex, `.not`, parsing numbers), skipping or marking the
test, or copying the value that the application showed into the spec is not a fix: such a repair is
rejected automatically.

<app_map>
{{APP_MAP}}
</app_map>

<conventions>
{{CONVENTIONS}}
</conventions>

<test_case>
{{TEST_CASE}}
</test_case>

<failed_spec>
```ts
{{PREVIOUS_CODE}}
```
</failed_spec>

<failure>
{{FAILURE}}
</failure>
{{NOTE}}
Reply with either exactly one ```ts code block that holds the complete corrected spec file, or the single
APP_BUG line. Nothing else.
