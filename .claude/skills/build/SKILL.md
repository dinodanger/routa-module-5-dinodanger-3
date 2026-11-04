---
name: build
description: Build the next step of the MCP server. Use after the plan skill has said what to build.
---

Build the step the plan skill chose, one file per tool in `mcp/src/tools`, with a test in `mcp/test`, following `client/conventions.md`. Mark the step done in `plan.md` when its test passes, and commit, with a one-line message saying what and why.
