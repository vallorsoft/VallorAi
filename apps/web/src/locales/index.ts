import type { Dictionary, Locale } from './types'
import { ro } from './ro'
import { hu } from './hu'
import { en } from './en'

export type { Dictionary, Locale }
export { LOCALES, DEFAULT_LOCALE } from './types'

export const dictionaries: Record<Locale, Dictionary> = { ro, hu, en }
