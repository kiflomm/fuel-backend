import { Injectable, Logger } from '@nestjs/common';

type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;
  private initError: string | null = null;
  private admin: any = null;

  private ensureInitialized() {
    if (this.initialized || this.initError) return;

    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      this.initError =
        'FCM_SERVICE_ACCOUNT_JSON is not set; push notifications are disabled';
      this.logger.warn(this.initError);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const firebaseAdmin = require('firebase-admin');
      const serviceAccount = JSON.parse(raw);

      if (firebaseAdmin.apps?.length) {
        this.admin = firebaseAdmin;
      } else {
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount),
        });
        this.admin = firebaseAdmin;
      }

      this.initialized = true;
    } catch (e) {
      this.initError = `FCM init failed: ${String((e as any)?.message ?? e)}`;
      this.logger.error(this.initError);
    }
  }

  async sendToTokens(tokens: string[], message: FcmMessage) {
    this.ensureInitialized();
    if (!this.initialized || !this.admin) {
      return {
        attempted: tokens.length,
        sent: 0,
        failed: tokens.length,
        disabled: true,
        reason: this.initError,
      };
    }

    const unique = [...new Set(tokens.filter((t) => t && t.trim()))];
    if (unique.length === 0) {
      return { attempted: 0, sent: 0, failed: 0, disabled: false };
    }

    const payload = {
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data ?? {},
      tokens: unique,
    };

    const resp = await this.admin.messaging().sendEachForMulticast(payload);
    return {
      attempted: unique.length,
      sent: resp.successCount ?? 0,
      failed: resp.failureCount ?? 0,
      disabled: false,
    };
  }
}

