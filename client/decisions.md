# Decisions

| Date | Decision | Who |
| --- | --- | --- |
| 2026-10-20 | Every change goes through a preview first. Applying takes the preview's id, so what is applied is what was shown. | Tuomas |
| 2026-10-20 | Tools change one thing we've asked for. No tool resets the whole grid. | Tuomas |
| 2026-10-22 | The server talks only to the platform's admin API. It doesn't touch HR or SCIM: the connector owns those. | Tuomas, Marja Hämäläinen |
| 2026-10-22 | No session revocation, as the platform has none. | Tuomas |
