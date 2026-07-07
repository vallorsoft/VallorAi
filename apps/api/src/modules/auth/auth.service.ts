import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { UsersService } from '../users/users.service'
import { MailService } from '../mail/mail.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email)
    if (existing) throw new ConflictException('Email already registered')

    const hashed = await bcrypt.hash(dto.password, 12)
    const verificationToken = randomBytes(32).toString('hex')
    const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)

    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashed,
      language: dto.language ?? 'ro',
      country: dto.country ?? 'RO',
      verificationToken,
      verificationTokenExpiresAt,
    })

    await this.mailService.sendVerificationEmail(user.email, user.name, verificationToken)

    return { message: 'Cont creat. Verifică emailul pentru a-ți activa contul.' }
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email)
    if (!user?.password) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(dto.password, user.password)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    if (!user.isVerified) {
      throw new ForbiddenException('Email neconfirmat. Verifică emailul pentru a-ți activa contul.')
    }

    return this.issueTokens(user.id, user.email, user.role)
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerificationToken(token)
    if (!user) throw new BadRequestException('Token invalid')

    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Token expirat')
    }

    await this.usersService.markVerified(user.id)

    return this.issueTokens(user.id, user.email, user.role)
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user) throw new NotFoundException('User not found')
    if (user.isVerified) throw new ConflictException('Email already verified')

    const verificationToken = randomBytes(32).toString('hex')
    const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)

    await this.usersService.setVerificationToken(user.id, verificationToken, verificationTokenExpiresAt)
    await this.mailService.sendVerificationEmail(user.email, user.name, verificationToken)

    return { message: 'Email de confirmare retrimis.' }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken)
      return this.issueTokens(payload.sub, payload.email, payload.role)
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = { message: 'If that email exists, a reset link has been sent.' }

    const user = await this.usersService.findByEmail(dto.email)
    if (!user) return genericResponse // don't leak whether the email is registered

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS)
    await this.usersService.createPasswordResetToken(user.id, token, expiresAt)

    this.sendPasswordResetEmail(user.email, token)

    return genericResponse
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.usersService.findPasswordResetToken(dto.token)
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token')
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12)
    await this.usersService.updatePassword(resetToken.userId, hashed)
    await this.usersService.invalidateUnusedPasswordResetTokens(resetToken.userId)

    return { message: 'Password has been reset successfully.' }
  }

  // Stub pending the Brevo transactional email integration (Phase 5.5 in PROGRESS.md).
  // For now this just logs the reset link so the flow can be exercised locally/manually.
  private sendPasswordResetEmail(email: string, token: string) {
    console.log(`[auth] Password reset requested for ${email}. Reset token: ${token}`)
  }

  private issueTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role }
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
      userId,
    }
  }
}
