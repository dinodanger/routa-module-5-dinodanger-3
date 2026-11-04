# Brief: configure the identity platform by asking

From: Tuomas Hirvikoski, IT lead, Routa Advisory Oy
To: the delivery team

Thanks for the connector. It runs every week now, and joiners, movers and leavers are in line.

Our next problem is the platform's settings page. It's a grid of 14 groups by 11 applications, 154 boxes, and about twenty security policies below it. We change it a box at a time. It takes a long time, and it's easy to tick the wrong box.

We'd like to configure it by asking Claude: "contractors shouldn't reach finance", and it's done. So please build us an MCP server for the platform's admin API.

What we need from it:

- **Read the settings:** the access grid and the policies.
- **Change the settings,** and every change is shown before it is applied. We say yes to what we've seen.
- **Check the token on every call.** A read-only token can only read the settings. An admin token can change them. The platform's API won't stop a read-only token, so your server must. A read-only token that can change settings is the mistake we can't afford.

We'll use it from Claude Code, so please try it that way: over MCP, with both kinds of token. Keep it to what's above.

Our security baseline is in `security-baseline.json`. Build the server first. Connecting it to Claude Code, and bringing the settings in line with the baseline by asking, come after that.

The rest is in the files next to this one. This isn't the connector's project: please start a new project brain for it.

Tuomas
