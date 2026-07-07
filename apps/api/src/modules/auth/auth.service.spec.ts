import { UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'

type MockUser = {
  id: string
  email: string
  password: string
  role: string
  isVerified: boolean
}

describe('AuthService — forgot / reset password', () => {
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'createPasswordResetToken'
      | 'findPasswordResetToken'
      | 'updatePassword'
      | 'invalidateUnusedPasswordResetTokens'
    >
  >
  let jwtService: { sign: jest.Mock; verify: jest.Mock }
  let authService: AuthService
  let db: { user: MockUser; tokens: Map<string, { userId: string; usedAt: Date | null; expiresAt: Date }> }

  beforeEach(() => {
    db = {
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        password: bcrypt.hashSync('original-password-123', 12),
        role: 'USER',
        isVerified: true,
      },
      tokens: new Map(),
    }

    usersService = {
      findByEmail: jest.fn(async (email: string) => (email === db.user.email ? { ...db.user } : null)),
      createPasswordResetToken: jest.fn(async (userId: string, token: string, expiresAt: Date) => {
        const record = { userId, usedAt: null, expiresAt }
        db.tokens.set(token, record)
        return { id: token, token, ...record }
      }),
      findPasswordResetToken: jest.fn(async (token: string) => {
        const record = db.tokens.get(token)
        if (!record) return null
        return { id: token, token, ...record }
      }),
      updatePassword: jest.fn(async (_userId: string, hashedPassword: string) => {
        db.user.password = hashedPassword
        return { ...db.user }
      }),
      invalidateUnusedPasswordResetTokens: jest.fn(async (userId: string) => {
        let count = 0
        for (const record of db.tokens.values()) {
          if (record.userId === userId && !record.usedAt) {
            record.usedAt = new Date()
            count++
          }
        }
        return { count }
      }),
    } as unknown as typeof usersService

    jwtService = { sign: jest.fn(() => 'signed-jwt'), verify: jest.fn() }
    const mailService = { sendVerificationEmail: jest.fn() }

    authService = new AuthService(
      usersService as unknown as UsersService,
      mailService as any,
      jwtService as any,
    )
  })

  it('returns the generic success message for a nonexistent email without creating a token or leaking existence', async () => {
    const result = await authService.forgotPassword({ email: 'nobody@example.com' })

    expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' })
    expect(usersService.createPasswordResetToken).not.toHaveBeenCalled()
  })

  it('returns the same generic success message for a real email and creates a reset token', async () => {
    const result = await authService.forgotPassword({ email: db.user.email })

    expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' })
    expect(usersService.createPasswordResetToken).toHaveBeenCalledTimes(1)
    expect(db.tokens.size).toBe(1)
  })

  it('resets the password with a valid token, and a subsequent login succeeds with the new password while the old one fails', async () => {
    await authService.forgotPassword({ email: db.user.email })
    const [token] = db.tokens.keys()

    await authService.resetPassword({ token, newPassword: 'brand-new-password' })

    // Token should now be marked used.
    expect(db.tokens.get(token)?.usedAt).not.toBeNull()

    // Login with the new password succeeds.
    await expect(authService.login({ email: db.user.email, password: 'brand-new-password' })).resolves.toEqual(
      expect.objectContaining({ userId: db.user.id }),
    )

    // Login with the old (pre-reset) password now fails.
    await expect(
      authService.login({ email: db.user.email, password: 'original-password-123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('invalidates other outstanding reset tokens for the user once one is used', async () => {
    await authService.forgotPassword({ email: db.user.email })
    await authService.forgotPassword({ email: db.user.email })
    const [firstToken, secondToken] = db.tokens.keys()

    await authService.resetPassword({ token: firstToken, newPassword: 'brand-new-password' })

    expect(db.tokens.get(firstToken)?.usedAt).not.toBeNull()
    expect(db.tokens.get(secondToken)?.usedAt).not.toBeNull()

    await expect(
      authService.resetPassword({ token: secondToken, newPassword: 'another-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an unknown token', async () => {
    await expect(
      authService.resetPassword({ token: 'does-not-exist', newPassword: 'brand-new-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an already-used token', async () => {
    await authService.forgotPassword({ email: db.user.email })
    const [token] = db.tokens.keys()

    await authService.resetPassword({ token, newPassword: 'first-reset-password' })

    await expect(
      authService.resetPassword({ token, newPassword: 'second-reset-attempt' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an expired token', async () => {
    const expiredToken = 'expired-token'
    db.tokens.set(expiredToken, {
      userId: db.user.id,
      usedAt: null,
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
    })

    await expect(
      authService.resetPassword({ token: expiredToken, newPassword: 'brand-new-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('AuthService — login sanity check against bcrypt', () => {
  it('confirms bcrypt.compare distinguishes old vs new hashed passwords (used implicitly by login)', async () => {
    const hashed = await bcrypt.hash('correct-password', 12)
    expect(await bcrypt.compare('correct-password', hashed)).toBe(true)
    expect(await bcrypt.compare('wrong-password', hashed)).toBe(false)
  })
})
