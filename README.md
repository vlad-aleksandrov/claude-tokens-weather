# Token Weather

A [Claude Code](https://claude.com/claude-code) mod that shows a live forecast of your context window in the band above the prompt.

```
☔  Showers  67% of context  134.4k / 200k   last turns ▂▃▄▅▆█  ▲ +98.3k last turn
```

It's based on the example in [Claude Code Mods: Build Your Own AI Coding Experience With JavaScript](https://civillearning.medium.com/claude-code-mods-build-your-own-ai-coding-experience-with-javascript-c2ccdef78ff8) by Civil Learning.

## What it shows

| Context used | Forecast        | Meaning                            |
| -----------: | --------------- | ---------------------------------- |
|        < 25% | 🌞 Clear        | Plenty of context available        |
|       25–49% | ⛅ Cloudy       | Context usage is increasing        |
|       50–74% | ☔ Showers      | Context is getting moderately high |
|       75–89% | ⚡ Storm        | Context is getting very high       |
|         90%+ | 🌀 Compact soon | Run `/compact` soon                |

Next to the forecast, the band shows:

- **Percent used**, and the **tokens used** out of the window, for example `134.4k / 200k`.
- **Last turns**: a sparkline of the last 16 readings, scaled between the smallest (`▁`) and the largest (`█`) of them, so a few thousand tokens a turn still shows as growth deep into a 1M window.
- **Trend**: how much the last turn added (`▲ +98.3k last turn`) or freed (`▼ …`), or `steady`.

The sparkline and trend are hidden when the band is narrower than 60 columns. The band doesn't appear until the first reading arrives, and it steps aside while Claude Code is showing a survey.

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

To remove it: `claude plugin uninstall token-weather`.

## How it works

The whole mod is [`hooks/register.tsx`](hooks/register.tsx). It hooks three events:

| Event | What the mod does |
| --- | --- |
| `session.measure` | Claude Code raises this after each main-thread turn, when the context fill has changed. The mod appends the reading to its history and keeps the last 16. |
| `session.start` | Seeds the history from `$.session.usage()` when it is empty, for example in a resumed session. |
| `ui.render` on `AbovePrompt` | Draws the band from the history, or passes through with `next(e)` when there is nothing to show. |

The history is kept in session state (`$.state`, through `atom`/`read`/`update`), not in a module variable, so it survives hot reloads. Its shape is declared in [`types/index.d.ts`](types/index.d.ts).

The article's version listens to `turn.complete` and then calls `$.session.usage()`. This one uses `session.measure` instead. That event carries the same figures, fires only for the main thread (not subagents) and only when the context fill actually moved, so the mod needs no separate `agentId` check.

## Develop

```sh
claude plugin validate .          # manifest, hooks and state contract
claude plugin test .              # runs tests/*.test.ts against the engine
claude --plugin-dir .             # a session with the mod loaded and hot-reloading
```

Claude Code writes the API type declarations for your installed version into `.claude-plugin/types/` the first time it loads the mod. Treat those as the source of truth, since the mods API can change between releases.

## License

[MIT](LICENSE)
