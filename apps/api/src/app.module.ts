import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { AiModule } from './modules/ai/ai.module'
import { HousesModule } from './modules/houses/houses.module'
import { RulesModule } from './modules/rules/rules.module'
import { CostsModule } from './modules/costs/costs.module'
import { ExportsModule } from './modules/exports/exports.module'
import { SettingsModule } from './modules/settings/settings.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    ProjectsModule,
    AiModule,
    HousesModule,
    RulesModule,
    CostsModule,
    ExportsModule,
    SettingsModule,
  ],
})
export class AppModule {}
