import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import axios, { AxiosError } from 'axios';

interface SendMailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

@Injectable()
export class MailerService {
  private resend?: Resend;
  private readonly logger = new Logger(MailerService.name);
  private defaultFrom?: string;

  constructor(private readonly configService: ConfigService) { }

  /**
   * Checks if Promailer should be used based on environment variables.
   * Returns true if TESTING_MAILER is 'true' and PROMAILER_API_KEY is set.
   */
  private shouldUsePromailer(): boolean {
    const testingMailer = this.configService.get<string>('TESTING_MAILER');
    const promailerApiKey = this.configService.get<string>('PROMAILER_API_KEY');
    return testingMailer === 'true' && !!promailerApiKey;
  }

  /**
   * Validates and normalizes the email "from" field to match Resend's format requirements.
   * Resend requires: `email@example.com` or `Name <email@example.com>`
   */
  private normalizeFromEmail(fromEmail: string): string {
    // Remove any extra whitespace
    const trimmed = fromEmail.trim();

    // Check if it's already in the correct format (Name <email@domain.com> or Name<email@domain.com>)
    // This regex allows for optional spaces around the angle brackets
    const nameEmailRegex = /^[^<]+?\s*<\s*[^>]+\s*>$/;
    if (nameEmailRegex.test(trimmed)) {
      // Normalize spaces: ensure exactly one space before < and no spaces inside <>
      const match = trimmed.match(/^(.+?)\s*<\s*([^>]+)\s*>$/);
      if (match) {
        const name = match[1].trim();
        const email = match[2].trim();
        return `${name} <${email}>`;
      }
      return trimmed;
    }

    // Check if it's a simple email format (email@domain.com)
    const emailRegex = /^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/;
    if (emailRegex.test(trimmed)) {
      return trimmed;
    }

    // If it doesn't match either format, try to extract email and format it
    const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[1];
      // Extract name if present (text before the email)
      const beforeEmail = trimmed.substring(0, emailMatch.index).trim();
      if (beforeEmail && beforeEmail !== email) {
        // Remove common separators and clean up
        const name = beforeEmail.replace(/[<>()[\]]/g, '').trim();
        if (name) {
          return `${name} <${email}>`;
        }
      }
      return email;
    }

    // If we can't parse it, log a warning and return a default
    this.logger.warn(
      `Invalid "from" email format: "${fromEmail}". Using default onboarding@resend.dev`,
    );
    return 'onboarding@resend.dev';
  }

  private ensureResendClient(): Resend {
    if (this.resend) {
      return this.resend;
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('Resend configuration is missing (RESEND_API_KEY)');
    }

    const fromEmail =
      this.configService.get<string>('RESEND_FROM') ||
      this.configService.get<string>('SMTP_FROM') ||
      'onboarding@resend.dev';

    // Normalize the from email to ensure it matches Resend's format requirements
    this.defaultFrom = this.normalizeFromEmail(fromEmail);

    if (this.defaultFrom !== fromEmail) {
      this.logger.log(`Normalized "from" email from "${fromEmail}" to "${this.defaultFrom}"`);
    }

    this.resend = new Resend(apiKey);

    return this.resend;
  }

  /**
   * Sends email via Promailer API.
   * Requires TESTING_MAILER=true and PROMAILER_API_KEY to be set.
   */
  private async sendMailViaPromailer(options: SendMailOptions): Promise<void> {
    const apiKey = this.configService.get<string>('PROMAILER_API_KEY');

    if (!apiKey) {
      throw new Error('Promailer configuration is missing (PROMAILER_API_KEY)');
    }

    // Ensure at least html or text is provided
    if (!options.html && !options.text) {
      throw new Error('Either html or text must be provided');
    }

    // Build the payload for Promailer API
    const payload: {
      to: string;
      subject: string;
      html?: string;
      text?: string;
      from?: string;
    } = {
      to: Array.isArray(options.to) ? options.to[0] : options.to,
      subject: options.subject,
    };

    if (options.html) {
      payload.html = options.html;
    }
    if (options.text) {
      payload.text = options.text;
    }

    // Include "from" field only if RESEND_FROM or SMTP_FROM is set
    const fromEmail =
      this.configService.get<string>('RESEND_FROM') ||
      this.configService.get<string>('SMTP_FROM');

    if (fromEmail) {
      payload.from = fromEmail.trim();
    }

    try {
      const response = await axios.post(
        'https://mailserver.automationlounge.com/api/v1/messages/send',
        payload,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Log success for debugging
      this.logger.log('Email sent successfully via Promailer', {
        messageId: response.data?.id || response.data?.messageId,
        to: options.to,
        subject: options.subject,
      });
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const errorMessage =
        (axiosError.response?.data && typeof axiosError.response.data === 'object' && 'message' in axiosError.response.data
          ? axiosError.response.data.message
          : null) ||
        axiosError.message ||
        'Unknown error from Promailer API';

      this.logger.error('Promailer API error', {
        error: axiosError.response?.data || axiosError.message,
        message: errorMessage,
        status: axiosError.response?.status,
        to: options.to,
        subject: options.subject,
      });

      throw new Error(`Failed to send email via Promailer: ${errorMessage}`);
    }
  }

  private async sendMail(options: SendMailOptions) {
    // Check if TESTING_MAILER is enabled
    const testingMailer = this.configService.get<string>('TESTING_MAILER');
    if (testingMailer === 'true') {
      const promailerApiKey = this.configService.get<string>('PROMAILER_API_KEY');
      if (!promailerApiKey) {
        throw new Error(
          'TESTING_MAILER is enabled but PROMAILER_API_KEY is missing. Please set PROMAILER_API_KEY in your environment variables.',
        );
      }
      return this.sendMailViaPromailer(options);
    }

    // Default to Resend
    const resend = this.ensureResendClient();

    // Ensure at least html or text is provided
    if (!options.html && !options.text) {
      throw new Error('Either html or text must be provided');
    }

    // Build the payload ensuring TypeScript understands at least one render option exists
    const basePayload = {
      from: this.defaultFrom!,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
    };

    // TypeScript needs help understanding that at least html or text exists
    const payloadWithContent = options.html && options.text
      ? { ...basePayload, html: options.html, text: options.text }
      : options.html
        ? { ...basePayload, html: options.html }
        : { ...basePayload, text: options.text! };

    const result = await resend.emails.send(payloadWithContent);

    // Resend returns { data, error } format - check for errors
    if (result.error) {
      const errorMessage = result.error.message || 'Unknown error from Resend API';
      this.logger.error('Resend API error', {
        error: result.error,
        message: errorMessage,
        to: options.to,
        subject: options.subject,
      });
      throw new Error(`Failed to send email via Resend: ${errorMessage}`);
    }

    // Log success for debugging
    this.logger.log('Email sent successfully', {
      emailId: result.data?.id,
      to: options.to,
      subject: options.subject,
    });
  }

  async sendPasswordResetEmail(email: string, code: string) {
    try {
      await this.sendMail({
        to: email,
        subject: 'Your Password Reset Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password.</p>
            <p>Your password reset code is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
            </div>
            <p><strong>This code expires in 10 minutes.</strong></p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
        text: `Your password reset code is: ${code}. This code expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send password reset email',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}


