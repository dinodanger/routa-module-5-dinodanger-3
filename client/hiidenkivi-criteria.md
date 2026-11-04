# Hiidenkivi's security criteria

Hiidenkivi Oy wants to use the same MCP server for its own platform, which Routa looks after. Its IT manager, Henna Korpela, sent these. They are stricter than Routa's. Read the server against each rule and rate what you find.

- **Critical:** anyone can change a setting without a valid token, or a token ends up in the repository.
- **High:** a read-only token can change a setting. A change is applied that wasn't shown first. A token reaches a log or a tool's answer. Changes aren't recorded in an audit trail: which scope, what changed, when. A preview stays valid for more than five minutes.
- **Medium:** an error message that doesn't say what to do next.
- **Low:** a tool description IT would misread.

Anything high or critical can't move on until it is fixed. Low and medium are noted and can move on.

Quote the file and line you saw for every finding.
