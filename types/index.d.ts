export type Reading = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Cost = { total: number; atLastTurn: number | null; lastPrompt: number | null }

declare module 'claude-code' {
  interface PluginState {
    'token-weather': {
      readings: Reading[]
      limits: Limit[]
      cost: Cost | null
      lastTurnAt: number | null
    }
  }
}
