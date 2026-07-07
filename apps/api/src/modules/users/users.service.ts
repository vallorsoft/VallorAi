import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

@Injectable()
export class UsersService {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  }

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  }

  create(data: { email: string; name: string; password: string; language: string; country: string }) {
    return prisma.user.create({ data })
  }

  update(id: string, data: Partial<{ name: string; language: string; avatarUrl: string }>) {
    return prisma.user.update({ where: { id }, data })
  }

  updatePassword(id: string, hashedPassword: string) {
    return prisma.user.update({ where: { id }, data: { password: hashedPassword } })
  }

  createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({ data: { userId, token, expiresAt } })
  }

  findPasswordResetToken(token: string) {
    return prisma.passwordResetToken.findUnique({ where: { token } })
  }

  invalidateUnusedPasswordResetTokens(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  }
}
