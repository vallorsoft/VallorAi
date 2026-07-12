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

  async sendInviteEmail(opts: {
    to: string
    inviterName: string
    projectName: string
    projectId: string
    role: string
  }): Promise<void> {
    const acceptUrl = `${this.frontendUrl}/projects/${opts.projectId}?acceptInvite=1`
    const roleLabel = opts.role === 'EDITOR' ? 'editor' : 'vizualizator'
    const subject = `Invitație colaborare — ${opts.projectName}`
    const htmlContent = `
      <p>Bună!</p>
      <p><strong>${opts.inviterName}</strong> te-a invitat să colaborezi la proiectul
         <strong>${opts.projectName}</strong> cu rolul de <strong>${roleLabel}</strong>.</p>
      <p><a href="${acceptUrl}">Acceptă invitația</a></p>
      <p>Dacă nu ai un cont AI Home Designer, înregistrează-te la
         <a href="${this.frontendUrl}/register">${this.frontendUrl}/register</a>.</p>
    `
    await this.send(opts.to, subject, htmlContent)
  }

  async sendTaskAssignedEmail(opts: {
    to: string
    assignerName: string
    projectName: string
    projectId: string
    taskTitle: string
    dueDate?: Date | null
  }): Promise<void> {
    const projectUrl = `${this.frontendUrl}/projects/${opts.projectId}`
    const dueLine = opts.dueDate
      ? `<p>Termen limită: <strong>${opts.dueDate.toLocaleDateString('ro-RO')}</strong></p>`
      : ''
    const subject = `Sarcină nouă atribuită — ${opts.projectName}`
    const htmlContent = `
      <p>Bună!</p>
      <p><strong>${opts.assignerName}</strong> ți-a atribuit sarcina
         <strong>${opts.taskTitle}</strong> în proiectul <strong>${opts.projectName}</strong>.</p>
      ${dueLine}
      <p><a href="${projectUrl}">Deschide proiectul</a></p>
    `
    await this.send(opts.to, subject, htmlContent)
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
