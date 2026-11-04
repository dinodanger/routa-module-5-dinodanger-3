---
name: verify
description: Check whether the MCP server is done. Use after each build step, and before saying the work is done.
---

Run the checks below. Report each failing check with its error, or say that every check passed. Don't fix anything here, and don't reset anything.

## The checks

1. **The tests pass:** `npm test`.
2. **A live run, as IT would:** `npm run live-check`, with the test environment running. It takes the two tokens from `ROUTA_TOKEN` and `ROUTA_READONLY_TOKEN`, which are already in the environment. Don't read the token files.
