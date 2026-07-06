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

  findByVerificationToken(token: string) {
    return prisma.user.findUnique({ where: { verificationToken: token } })
  }

  create(data: {
    email: string
    name: string
    password: string
    language: string
    country: string
    verificationToken: string
    verificationTokenExpiresAt: Date
  }) {
    return prisma.user.create({ data })
  }

  markVerified(id: string) {
    return prisma.user.update({
      where: { id },
      data: { isVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
    })
  }

  setVerificationToken(id: string, token: string, expiresAt: Date) {
    return prisma.user.update({
      where: { id },
      data: { verificationToken: token, verificationTokenExpiresAt: expiresAt },
    })
  }

  update(id: string, data: Partial<{ name: string; language: string; avatarUrl: string }>) {
    return prisma.user.update({ where: { id }, data })
  }
}
