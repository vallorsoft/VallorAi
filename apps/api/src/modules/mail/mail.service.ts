import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly apiKey: string
  private readonly senderEmail: string
  private readonly senderName: string
  private readonly frontendUrl: string

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get('BREVO_API_KEY') ?? ''
    this.senderEmail = this.config.get('BREVO_SENDER') ?? 'no-reply@vallorai.com'
    this.senderName = this.config.get('BREVO_SENDER_NAME') ?? 'AI Home Designer'
    this.frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:3000'
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`

    const subject = 'Confirmă adresa de email — AI Home Designer'
    const htmlContent = `
      <p>Bună, ${name}!</p>
      <p>Îți mulțumim pentru înregistrare. Pentru a-ți activa contul, confirmă adresa de email:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>Linkul expiră în 24 de ore.</p>
    `

    await this.send(to, subject, htmlContent)
  }

  private async send(to: string, subject: string, htmlContent: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`BREVO_API_KEY not set — skipping email to ${to}: ${subject}`)
      return
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        sender: { email: this.senderEmail, name: this.senderName },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      this.logger.error(`Brevo send failed (${response.status}): ${body}`)
      throw new Error('Failed to send email')
    }
  }
}
