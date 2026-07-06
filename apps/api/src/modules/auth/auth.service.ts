import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { UsersService } from '../users/users.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email)
    if (existing) throw new ConflictException('Email already registered')

    const hashed = await bcrypt.hash(dto.password, 12)
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashed,
      language: dto.language ?? 'ro',
      country: dto.country ?? 'RO',
    })

    return this.issueTokens(user.id, user.email, user.role)
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email)
    if (!user?.password) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(dto.password, user.password)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.issueTokens(user.id, user.email, user.role)
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken)
      return this.issueTokens(payload.sub, payload.email, payload.role)
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
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
