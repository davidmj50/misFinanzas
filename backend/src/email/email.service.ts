import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'MisFinanzas <onboarding@resend.dev>';
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY no configurado; no se envió el correo "${subject}" a ${to}`);
      return false;
    }

    const { error } = await this.resend.emails.send({ from: this.from, to, subject, html });
    if (error) {
      this.logger.error(`Error enviando correo a ${to}: ${error.message}`);
      return false;
    }
    return true;
  }
}
