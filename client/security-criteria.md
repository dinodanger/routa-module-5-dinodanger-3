# Routa's security criteria for the MCP server

Owner: Tuomas Hirvikoski, IT. Read the server against each rule and rate what you find.

- **Critical:** anyone can change a setting without a valid token, or a token ends up in the repository.
- **High:** a read-only token can change a setting. A change is applied that wasn't shown first. A token reaches a log or a tool's answer.
- **Medium:** changes aren't recorded anywhere, so nobody can say who changed what. A preview stays valid forever.
- **Low:** an error message that doesn't say what to do next. A tool description IT would misread.

Anything high or critical can't move on until it is fixed. Low and medium are noted and can move on.

Quote the file and line you saw for every finding.
