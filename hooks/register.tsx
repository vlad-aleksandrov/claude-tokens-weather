import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { Reading } from '../types'

const HISTORY = 16
const BARS = '▁▂▃▄▅▆▇█'

const FORECAST = [
  { upTo: 25, icon: '🌞', word: 'Clear', color: 'yellow' },
  { upTo: 50, icon: '⛅', word: 'Cloudy', color: 'cyan' },
  { upTo: 75, icon: '☔', word: 'Showers', color: 'blue' },
  { upTo: 90, icon: '⚡', word: 'Storm', color: 'magenta' },
  { upTo: Infinity, icon: '🌀', word: 'Compact soon', color: 'red' },
] as const

const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [] as Reading[])

export const register: Register = on => {
  // A hot reload fires session.start again, so only seed an empty history (a resumed session).
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if ((await read($, readings)).length === 0) {
      await record($, (await $.session.usage()).context)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await record($, e.context)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const history = await read($, readings)
    const now = history.at(-1)
    if (e.props.hasSurvey || !now) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const forecast = FORECAST.find(f => now.percent < f.upTo) ?? FORECAST[4]
    const isWide = e.props.bodyColumns >= 60

    return (
      <Box flexDirection="row" paddingX={1}>
        <Text color={forecast.color} bold>
          {`${forecast.icon}  ${forecast.word}`}
        </Text>
        <Text>{`  ${now.percent}% of context`}</Text>
        <Text dimColor>{`  ${short(now.tokens)} / ${short(now.window)}`}</Text>
        {isWide && <Text dimColor>{'   last turns '}</Text>}
        {isWide && <Text color={forecast.color}>{sparkline(history)}</Text>}
        {isWide && history.length > 1 && <Text dimColor>{trend(now.tokens - (history.at(-2)?.tokens ?? 0))}</Text>}
      </Box>
    )
  })
}

async function record($: EngineInterface, context: SessionContextUsage) {
  if (!context.window || context.tokens === undefined) {
    return
  }
  const reading: Reading = {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent ?? Math.round((context.tokens / context.window) * 100),
  }
  await update($, readings, history => [...history, reading].slice(-HISTORY))
}

function sparkline(history: Reading[]) {
  const tokens = history.map(r => r.tokens)
  const low = Math.min(...tokens)
  const span = Math.max(...tokens) - low || 1
  return tokens.map(t => BARS[Math.round(((t - low) / span) * (BARS.length - 1))]).join('')
}

function trend(delta: number) {
  if (delta === 0) {
    return '  steady'
  }
  return delta > 0 ? `  ▲ +${short(delta)} last turn` : `  ▼ ${short(-delta)} last turn`
}

function short(n: number) {
  if (n >= 1_000_000) {
    return `${+(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${+(n / 1_000).toFixed(1)}k`
  }
  return String(n)
}
