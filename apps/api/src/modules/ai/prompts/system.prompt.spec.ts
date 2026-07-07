import {
  getSystemPromptForLanguage,
  SYSTEM_PROMPT_RO,
  SYSTEM_PROMPT_EN,
  SYSTEM_PROMPT_HU,
} from './system.prompt'

describe('getSystemPromptForLanguage', () => {
  it("returns the Romanian prompt for 'ro'", () => {
    expect(getSystemPromptForLanguage('ro')).toBe(SYSTEM_PROMPT_RO)
  })

  it("returns the English prompt for 'en'", () => {
    expect(getSystemPromptForLanguage('en')).toBe(SYSTEM_PROMPT_EN)
  })

  it("returns the Hungarian prompt for 'hu'", () => {
    expect(getSystemPromptForLanguage('hu')).toBe(SYSTEM_PROMPT_HU)
  })

  it("falls back to Romanian for an unsupported language (e.g. 'de')", () => {
    expect(getSystemPromptForLanguage('de')).toBe(SYSTEM_PROMPT_RO)
  })
})
