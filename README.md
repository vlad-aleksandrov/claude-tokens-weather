# Token Weather

A [Claude Code](https://claude.com/claude-code) mod that shows a live forecast of your context window in the band above the prompt, next to your plan limits, the prompt cache and the session cost.

```
☔  Showers  67% of context  134.4k / 200k   ▂▃▄▅▆█  ▲ +98.3k  │  5h ╍╍──── 2% · 3h32  │  7d ━━╍─── 53% · 4d11h  │  cache 56 min  │  ≈ $0.41 (+$0.16)
```

Reading it left to right:

| Piece | Meaning |
| --- | --- |
| `☔  Showers` | The forecast for how full the context window is (see the table below). |
| `67% of context  134.4k / 200k` | Share of the context window used, and tokens used out of the window size. |
| `▂▃▄▅▆█` | Context size over the last 16 turns, oldest on the left, scaled between their lowest (`▁`) and highest (`█`). |
| `▲ +98.3k` | What the last turn added to the context (`▼` when it shrank, for example after `/compact`). |
| `5h ╍╍──── 2% · 3h32` | The 5-hour plan limit: a gauge, the share used, and the time until it resets. |
| `7d ━━╍─── 53% · 4d11h` | The same for the 7-day limit. |
| `cache 56 min` | Time left before the prompt cache expires and the next message pays full price for the whole context. |
| `≈ $0.41 (+$0.16)` | Session cost so far, and what the last prompt added. |

It's based on the example in [Claude Code Mods: Build Your Own AI Coding Experience With JavaScript](https://civillearning.medium.com/claude-code-mods-build-your-own-ai-coding-experience-with-javascript-c2ccdef78ff8) by Civil Learning. The limit gauges, cache countdown and cost follow the ideas of [Token Weather Usage](https://github.com/augiefra/claude-mods) by Eric Cologni, written anew for this mod.

## What it shows

| Context used | Forecast        | Meaning                            |
| -----------: | --------------- | ---------------------------------- |
|        < 25% | 🌞 Clear        | Plenty of context available        |
|       25–49% | ⛅ Cloudy       | Context usage is increasing        |
|       50–74% | ☔ Showers      | Context is getting moderately high |
|       75–89% | ⚡ Storm        | Context is getting very high       |
|         90%+ | 🌀 Compact soon | Run `/compact` soon                |

### Fields

**Forecast** (`☔  Showers`). How full this session's context window is, as a weather word from the table above. The context is everything the model re-reads on each message: the conversation so far, tool results, the system prompt and the loaded instructions.

**Context** (`67% of context  134.4k / 200k`). The share of the context window in use, then the tokens in use out of the window size. When it nears 100%, Claude Code compacts the conversation on its own; running `/compact` earlier lets you choose the moment.

**Recent turns** (`▂▃▄▅▆█`). The context size after each of the last 16 turns, oldest on the left. The bars are scaled between the smallest (`▁`) and the largest (`█`) of those 16 readings, not against the window, so steady growth still shows deep into a 1M window. After `/compact` the newest bar drops to `▁`. Older bars are dark grey; the newest 5 brighten into the forecast colour, so the latest reading stands out.

**Trend** (`▲ +98.3k`). How many tokens the last turn added to the context, `▼` with the amount freed when it shrank (after `/compact`), or `steady`.

**5-hour limit** (`5h ╍╍──── 2% · 3h32`). Your Claude plan's rolling 5-hour usage limit. It is account-wide: it counts every Claude Code session and claude.ai, not only this session. The gauge compares the share of the limit used with the share of the 5-hour window already gone:

- `━` usage that is within the time elapsed,
- `╍` in colour: usage ahead of the clock (you are spending faster than the window passes),
- `╍` dim: time gone that you have not used,
- `─` the rest of the window.

Then the percent of the limit used, and the time until the window resets (`3h32` is 3 hours 32 minutes). The gauge is green while usage is behind the clock, yellow when ahead of it, and red at 15 points ahead or 90% used.

**7-day limit** (`7d ━━╍─── 53% · 4d11h`). The same for the plan's weekly limit. `4d11h` is the time until it resets, 4 days 11 hours, not the session's age.

The two limit gauges appear only on a Claude subscription, once a response has reported them; with an API key there are none.

**Prompt cache** (`cache 56 min`). Each message keeps the start of the conversation cached; the next message reads it from the cache at about a tenth of the input price, and every message restarts the clock. The countdown is the time left before the cache expires, counted from the end of your last turn. After that it shows `expired`: the next message writes the whole context again at full price, which on a subscription counts against your 5h and 7d limits. In the last 5 minutes the countdown switches to `m:ss` (`4:59`, `4:58`, …) and ticks every second, in yellow, then red for the last 2 minutes. Reply before it runs out to keep a long session cheap, or `/compact` first after a long pause.

The cache lasts 1 hour on a Claude subscription within its limits, and 5 minutes otherwise (an API key, or past a limit). That is Claude Code's default rule, inferred by the mod rather than reported by Claude Code: environment overrides such as `FORCE_PROMPT_CACHING_5M` are not read.

**Cost** (`≈ $0.41 (+$0.16)`). What this session has cost so far, the same total `/cost` shows, subagents included; in brackets, what your last prompt added. On an API key that is real spend. On a Claude subscription you are not billed per token: it is what the same usage would cost at API list prices, and your actual budget is the 5h and 7d limits.

### Layout

The limit gauges are left out when there is no subscription reading (an API key, or before the first response). When the band is too narrow, blocks drop from the right: cost first, the sparkline last. The band doesn't appear until the first reading arrives, and it steps aside while Claude Code is showing a survey.

## Install

Requires Claude Code **2.1.287 or later**. Check your version with `claude --version`.

At the prompt of a Claude Code terminal session:

```
/plugin install token-weather --marketplace vlad-aleksandrov/claude-tokens-weather
```

Answer `y` to add the marketplace, then pick a scope: user for every project, or project/local for just this one.

Or from a shell:

```sh
claude plugin install token-weather --marketplace vlad-aleksandrov/claude-tokens-weather
```

Start a new session, or run `/reload-plugins`, and the forecast appears after your first turn.

If the marketplace install isn't available, clone the repo and load it straight from the folder:

```sh
git clone https://github.com/vlad-aleksandrov/claude-tokens-weather.git ~/claude-tokens-weather
claude plugin validate ~/claude-tokens-weather    # confirms your build accepts it
claude --plugin-dir ~/claude-tokens-weather
```

`--plugin-dir` loads the mod for that session only, so pass it each time you start `claude`.

## Uninstall

In a Claude Code session, run `/plugin`, open the installed plugins, pick `token-weather` and choose Uninstall. Run `/reload-plugins` if the band is still showing.

Or from a shell:

```sh
claude plugin uninstall token-weather                  # add --scope project or local if you installed it there
claude plugin marketplace remove claude-tokens-weather # optional: also forget the marketplace
```

Removing the marketplace too means a later install asks `Add marketplace?` again, as on a fresh machine.

## How it works

The whole mod is [`hooks/register.tsx`](hooks/register.tsx). It hooks four events:

| Event | What the mod does |
| --- | --- |
| `session.measure` | Claude Code raises this after each main-thread turn, when the context fill has changed. The mod appends the reading to its history and keeps the last 16, and keeps the latest rate limits and session cost. |
| `turn.complete` | At the end of each main-conversation turn (subagents' turns skipped), notes the time for the cache countdown and what the prompt cost. |
| `session.start` | Seeds the history, limits and cost from `$.session.usage()` when they are empty, for example in a resumed session, and redraws the band every minute so the time left keeps moving. |
| `ui.render` on `AbovePrompt` | Draws the band from the history, or passes through with `next(e)` when there is nothing to show. |

The history, limits, cost and last turn time are kept in session state (`$.state`, through `atom`/`read`/`update`), not in a module variable, so it survives hot reloads. Its shape is declared in [`types/index.d.ts`](types/index.d.ts).

The article's version listens to `turn.complete` and then calls `$.session.usage()`. This one takes the context from `session.measure` instead. That event carries the same figures, fires only for the main thread (not subagents) and only when the context fill actually moved. `turn.complete` is still used for the per-prompt cost and the cache clock, where it needs the `agentId` check.

## Develop

```sh
claude plugin validate .          # manifest, hooks and state contract
claude plugin test .              # runs tests/*.test.ts against the engine
claude --plugin-dir .             # a session with the mod loaded and hot-reloading
```

Claude Code writes the API type declarations for your installed version into `.claude-plugin/types/` the first time it loads the mod. Treat those as the source of truth, since the mods API can change between releases.

## License

[MIT](LICENSE)
