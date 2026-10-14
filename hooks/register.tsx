import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { Cost, Limit, Reading } from '../types'

const HISTORY = 16
const BARS = '▁▂▃▄▅▆▇█'
const GAUGE_CELLS = 6
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SPANS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 7 * DAY }
const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
// Points used ahead of the time elapsed, or a share used, that turn a gauge red.
const PACE_ALERT = 15
const USED_ALERT = 90
const SEPARATOR = '  │  '
// The sparkline's older bars stay this grey; the newest FADE_BARS brighten into the forecast colour.
const FADE_FROM = [60, 60, 60] as const
const FADE_BARS = 5

const FORECAST = [
  { upTo: 25, icon: '🌞', word: 'Clear', color: 'yellow', rgb: [230, 200, 40] },
  { upTo: 50, icon: '⛅', word: 'Cloudy', color: 'cyan', rgb: [60, 200, 220] },
  { upTo: 75, icon: '☔', word: 'Showers', color: 'blue', rgb: [80, 130, 240] },
  { upTo: 90, icon: '⚡', word: 'Storm', color: 'magenta', rgb: [210, 80, 210] },
  { upTo: Infinity, icon: '🌀', word: 'Compact soon', color: 'red', rgb: [230, 70, 70] },
] as const

const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [] as Reading[])
const limits = atom({ plugin: 'token-weather', key: 'limits' } as const, [] as Limit[])
const cost = atom({ plugin: 'token-weather', key: 'cost' } as const, null as Cost | null)
const lastTurnAt = atom({ plugin: 'token-weather', key: 'lastTurnAt' } as const, null as number | null)

type Segment = { width: number; parts: { text: string; color?: string; dim?: boolean; bold?: boolean }[] }

export const register: Register = on => {
  // A hot reload fires session.start again, so only seed what is still empty (a resumed session).
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    if ((await read($, readings)).length === 0) {
      await record($, usage.context)
    }
    if ((await read($, limits)).length === 0) {
      await update($, limits, () => usage.rateLimits)
    }
    if (usage.cost && !(await read($, cost))) {
      await update($, cost, () => ({ total: usage.cost!.usd, atLastTurn: usage.cost!.usd, lastPrompt: null }))
    }
    // The limits' time left and the cache countdown move without any event.
    $.clock.every(MINUTE, () => $.ui.invalidate('ui.render'))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await record($, e.context)
    }
    if (e.rateLimits.length > 0) {
      await update($, limits, () => e.rateLimits)
    }
    const usd = e.cost?.usd
    if (usd !== undefined) {
      await update($, cost, c => ({ total: usd, atLastTurn: c?.atLastTurn ?? null, lastPrompt: c?.lastPrompt ?? null }))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, lastTurnAt, () => now)
      await update($, cost, c =>
        c && { total: c.total, atLastTurn: c.total, lastPrompt: c.atLastTurn === null ? null : c.total - c.atLastTurn },
      )
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const history = await read($, readings)
    const latest = history.at(-1)
    if (e.props.hasSurvey || !latest) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const forecast = FORECAST.find(f => latest.percent < f.upTo) ?? FORECAST[4]
    const now = await $.clock.now()
    const rateLimits = await read($, limits)

    const head = `${forecast.icon}  ${forecast.word}`
    const core = `  ${latest.percent}% of context  ${short(latest.tokens)} / ${short(latest.window)}`
    // The icon is drawn two columns wide; the 2 more are the band's padding.
    let room = e.props.bodyColumns - (head.length + 1 + core.length + 2)

    const optional: Segment[] = [
      turnsSegment(history, forecast.rgb),
      ...['five_hour', 'seven_day'].flatMap(kind => {
        const limit = rateLimits.find(l => l.kind === kind)
        return limit ? [limitSegment(limit, now)] : []
      }),
      cacheSegment(await read($, lastTurnAt), rateLimits, now),
      costSegment(await read($, cost)),
    ].filter((s): s is Segment => s !== null)

    const shown: Segment[] = []
    for (const segment of optional) {
      const width = segment.width + (shown.length > 0 ? SEPARATOR.length : 0)
      if (width > room) {
        break
      }
      room -= width
      shown.push(segment)
    }

    return (
      <Box flexDirection="row" paddingX={1}>
        <Text color={forecast.color} bold>
          {head}
        </Text>
        <Text>{`  ${latest.percent}% of context`}</Text>
        <Text dimColor>{`  ${short(latest.tokens)} / ${short(latest.window)}`}</Text>
        {shown.flatMap((segment, i) => [
          ...(i > 0 ? [{ text: SEPARATOR, dim: true }] : [{ text: '   ' }]),
          ...segment.parts,
        ]).map((part, i) => (
          <Text key={String(i)} color={part.color} dimColor={part.dim} bold={part.bold}>
            {part.text}
          </Text>
        ))}
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

function segment(parts: Segment['parts']): Segment {
  return { width: parts.reduce((sum, p) => sum + [...p.text].length, 0), parts }
}

function turnsSegment(history: Reading[], rgb: readonly number[]): Segment {
  const bars = sparkline(history)
  const from = Math.max(0, bars.length - FADE_BARS)
  const parts: Segment['parts'] = bars.map((bar, i) => {
    const t = i < from ? 0 : (i - from + 1) / (bars.length - from)
    return { text: bar, color: hex(FADE_FROM.map((start, c) => start + ((rgb[c] ?? start) - start) * t)) }
  })
  const previous = history.at(-2)
  if (previous) {
    parts.push({ text: `  ${trend(history.at(-1)!.tokens - previous.tokens)}`, dim: true })
  }
  return segment(parts)
}

// A gauge of the share used against the share of the window's time elapsed:
// ━ used within the time, ╍ coloured when used ahead of time, ╍ dim for time not yet used.
function limitSegment(limit: Limit, now: number): Segment {
  const span = SPANS[limit.kind]
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  const left = Number.isFinite(resetsAt) ? Math.max(0, resetsAt - now) : null
  const used = Math.max(0, limit.percentUsed)
  const elapsed = span && left !== null ? Math.min(100, Math.max(0, ((span - left) / span) * 100)) : used
  const pace = used - elapsed
  const color = used >= USED_ALERT || pace > PACE_ALERT ? 'red' : pace > 0 ? 'yellow' : 'green'

  const usedCells = Math.round((used / 100) * GAUGE_CELLS)
  const timeCells = Math.round((elapsed / 100) * GAUGE_CELLS)
  const filled = Math.min(GAUGE_CELLS, Math.max(usedCells, timeCells))
  const parts: Segment['parts'] = [
    { text: `${LIMIT_LABELS[limit.kind] ?? limit.kind} ` },
    { text: '━'.repeat(Math.min(usedCells, timeCells)), color },
    { text: '╍'.repeat(Math.max(0, usedCells - timeCells)), color },
    { text: '╍'.repeat(Math.max(0, timeCells - usedCells)), dim: true },
    { text: '─'.repeat(GAUGE_CELLS - filled), dim: true },
    { text: ` ${Math.round(used)}%`, bold: true, color: color === 'red' ? 'red' : undefined },
  ]
  if (left !== null) {
    parts.push({ text: ` · ${duration(left)}`, dim: true })
  }
  return segment(parts.filter(p => p.text))
}

// Claude Code keeps the prompt cache for an hour on a subscription within its limits, else for
// 5 minutes; each request restarts it. The last main turn's end stands for its last request.
function cacheSegment(at: number | null, rateLimits: Limit[], now: number): Segment | null {
  if (at === null) {
    return null
  }
  const plan = rateLimits.filter(l => l.kind in SPANS)
  const ttl = plan.length > 0 && plan.every(l => l.percentUsed < 100) ? HOUR : 5 * MINUTE
  const left = at + ttl - now
  return segment(
    left > 0
      ? [{ text: 'cache ' }, { text: duration(left), bold: true }]
      : [{ text: 'cache ' }, { text: 'expired', bold: true, color: 'red' }],
  )
}

function costSegment(c: Cost | null): Segment | null {
  if (!c) {
    return null
  }
  const parts: Segment['parts'] = [{ text: `≈ ${dollars(c.total)}`, bold: true }]
  if (c.lastPrompt !== null) {
    parts.push({ text: ` (+${dollars(c.lastPrompt)})`, dim: true })
  }
  return segment(parts)
}

function sparkline(history: Reading[]) {
  const tokens = history.map(r => r.tokens)
  const low = Math.min(...tokens)
  const span = Math.max(...tokens) - low || 1
  return tokens.map(t => BARS[Math.round(((t - low) / span) * (BARS.length - 1))] ?? '▁')
}

function hex(rgb: number[]) {
  return `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

function trend(delta: number) {
  if (delta === 0) {
    return 'steady'
  }
  return delta > 0 ? `▲ +${short(delta)}` : `▼ ${short(-delta)}`
}

// 42 min, 3h32, 4d11h.
function duration(ms: number) {
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) {
    return `${days}d${hours}h`
  }
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

function dollars(usd: number) {
  return usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`
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
