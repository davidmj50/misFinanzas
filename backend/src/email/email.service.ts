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
    this.from =
      this.config.get<string>('EMAIL_FROM') ??
      'MisFinanzas <onboarding@resend.dev>';
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('Envío de correo no disponible: falta configuración.');
      return false;
    }

    let error;
    try {
      ({ error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      }));
    } catch {
      this.logger.error('No se pudo entregar el correo al proveedor.');
      return false;
    }
    if (error) {
      this.logger.error('El proveedor no aceptó el correo.');
      return false;
    }
    return true;
  }
}
