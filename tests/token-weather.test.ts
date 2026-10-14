import { describe, expect, test } from 'claude-code/testing'

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
      expect(text).toContain('▲ +49.4k last turn')
    }

    await measure(170_000)
    const narrow = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: band(40) })
    const narrowText = (await narrow.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(narrowText).toContain('⚡  Storm')
    expect(narrowText).not.toContain('last turn')
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
})
