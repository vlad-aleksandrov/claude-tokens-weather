import { describe, expect, mock, test } from 'claude-code/testing'

const WINDOW = 200_000
const SURFACES = ['terminal', 'desktop'] as const

const band = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

describe('token-weather', () => {
  test('the band follows the context window', async ($, on) => {
    mock.clock(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    const measure = (tokens: number) =>
      $.session.measure({
        context: { tokens, window: WINDOW, percent: Math.round(tokens / 2_000) },
        rateLimits: [],
        changed: ['context'],
      })

    await measure(36_100)
    await measure(85_000)
    await $.session.measure({ context: { tokens: 1, window: WINDOW }, rateLimits: [], changed: ['cost'] })
    await measure(134_400)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'token-weather', surface, component: 'AbovePrompt', props: band(120) })
      const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
      expect(text).toContain('☔  Showers')
      expect(text).toContain('67% of context')
      expect(text).toContain('134.4k / 200k')
      expect(text).toContain('▁▄█')
      expect(text).toContain('▲ +49.4k')
      expect(text).not.toContain('last turn')
      const bars = (await ui.findAll({ type: 'Text' })).filter(t => [...t.text].length === 1 && '▁▂▃▄▅▆▇█'.includes(t.text))
      expect(bars.map(b => b.props.color)).toEqual(['#435378', '#496bb4', '#5082f0'])
    }

    for (const tokens of [140_000, 145_000, 150_000]) {
      await measure(tokens)
    }
    const faded = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(120) })
    const fadedBars = (await faded.findAll({ type: 'Text' })).filter(t => [...t.text].length === 1 && '▁▂▃▄▅▆▇█'.includes(t.text))
    expect(fadedBars.map(b => b.props.color)).toEqual(['#3c3c3c', '#5a405a', '#784478', '#964896', '#b44cb4', '#d250d2'])

    await measure(170_000)
    const narrow = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(40) })
    const narrowText = (await narrow.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(narrowText).toContain('⚡  Storm')
    expect(narrowText).not.toContain('▲')
  })

  test('the band stays out of the way with no reading or during a survey', async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    const empty = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(120) })
    expect((await empty.find({ type: 'Text' }))?.text).toBe('engine band')

    await $.session.measure({ context: { tokens: 190_000, window: WINDOW, percent: 95 }, rateLimits: [], changed: ['context'] })
    const survey = await $.ui.mount({
      plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: { ...band(120), hasSurvey: true },
    })
    expect((await survey.find({ type: 'Text' }))?.text).toBe('engine band')
  })

  test('the band adds the plan limits, the prompt cache and the cost', async ($, on) => {
    const start = Date.parse('2026-10-14T10:00:00Z')
    const clock = mock.clock(on, { now: start })
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    const turn = (turnId: string) =>
      $.turn.complete({ answer: '', durationMs: 0, isAborted: false, turnId, reason: 'answer' })
    const measure = (usd: number) =>
      $.session.measure({
        context: { tokens: 75_000, window: 1_000_000, percent: 8 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 2, resetsAt: new Date(start + (3 * 60 + 36) * 60_000).toISOString() },
          { kind: 'seven_day', percentUsed: 53, resetsAt: new Date(start + (4 * 24 + 11) * 3_600_000 + 4 * 60_000).toISOString() },
        ],
        cost: { usd },
        changed: ['context', 'rateLimits', 'cost'],
      })

    await measure(0.25)
    await turn('t1')
    await measure(0.41)
    await turn('t2')
    await $.turn.complete({ answer: '', durationMs: 0, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'a1' })
    await clock.advance(4 * 60_000)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'token-weather', surface, component: 'AbovePrompt', props: band(160) })
      const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
      expect(text).toContain('5h ╍╍──── 2% · 3h32')
      expect(text).toContain('7d ━━╍─── 53% · 4d11h')
      expect(text).toContain('cache 56 min')
      expect(text).toContain('≈ $0.41 (+$0.16)')
    }

    const cache = async () => {
      const ui = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(160) })
      const texts = await ui.findAll({ type: 'Text' })
      const at = texts.findIndex(t => t.text === 'cache ')
      return { text: texts[at + 1]?.text, color: texts[at + 1]?.props.color }
    }
    await clock.advance((50 * 60 + 55) * 1_000)
    expect(await cache()).toEqual({ text: '5 min', color: undefined })
    await clock.advance(6_000)
    expect(await cache()).toEqual({ text: '4:59', color: 'yellow' })
    await clock.advance((2 * 60 + 58) * 1_000)
    expect(await cache()).toEqual({ text: '2:01', color: 'yellow' })
    await clock.advance(2_000)
    expect(await cache()).toEqual({ text: '1:59', color: 'red' })
    await clock.advance(119_000)
    expect(await cache()).toEqual({ text: 'expired', color: 'red' })

    const narrow = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(80) })
    const narrowText = (await narrow.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(narrowText).toContain('8% of context')
    expect(narrowText).not.toContain('≈ $')
  })
})
