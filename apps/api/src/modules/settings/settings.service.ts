import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

const SETTINGS_ID = 'singleton'

@Injectable()
export class SettingsService {
  async getAiSettings() {
    const settings = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    })
    return { allowPaidAiProviders: settings.allowPaidAiProviders }
  }

  async setAllowPaidAiProviders(allow: boolean) {
    const settings = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, allowPaidAiProviders: allow },
      update: { allowPaidAiProviders: allow },
    })
    return { allowPaidAiProviders: settings.allowPaidAiProviders }
  }
}
