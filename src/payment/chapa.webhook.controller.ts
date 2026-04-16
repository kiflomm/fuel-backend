import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PaymentProcessingService } from './payment-processing.service';

type ChapaWebhookBody = Record<string, unknown>;

@ApiTags('Payments')
@Controller(['payments', 'api/payments'])
export class ChapaWebhookController {
  constructor(
    private readonly paymentProcessing: PaymentProcessingService,
    private readonly configService: ConfigService,
  ) {}

  private isValidWebhookSignature(body: unknown, signature: string | undefined) {
    const secret = this.configService.get<string>('CHAPA_WEBHOOK_SECRET') || '';
    if (!secret) {
      // If you haven't configured a secret hash in Chapa, we can't verify signatures.
      return true;
    }
    if (!signature) return false;
    try {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body ?? {}))
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  private extractTxRefFromCallbackOrWebhook(input: {
    query: Record<string, unknown>;
    body: Record<string, unknown>;
  }): string | null {
    // callback_url docs: trx_ref (note the "r")
    const q = input.query;
    const b = input.body;
    const txRef =
      (typeof q.tx_ref === 'string' && q.tx_ref) ||
      (typeof q.trx_ref === 'string' && q.trx_ref) ||
      (typeof b.tx_ref === 'string' && b.tx_ref) ||
      (typeof b.trx_ref === 'string' && b.trx_ref) ||
      null;
    return txRef ? txRef.trim() : null;
  }

  @Get('webhook/chapa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chapa callback_url handler (GET) – verifies tx_ref with Chapa',
  })
  @ApiOkResponse({ description: 'Callback acknowledged' })
  async chapaCallback(
    @Query() query: Record<string, unknown>,
    @Body() body: ChapaWebhookBody,
  ) {
    const txRef = this.extractTxRefFromCallbackOrWebhook({ query, body });
    if (txRef) {
      await this.paymentProcessing.verifyAndFinalizeByTxRef(txRef, {
        kind: 'callback_url',
        query,
        body,
      });
    }
    // Always 200 OK so Chapa doesn't keep retrying callbacks.
    return { ok: true };
  }

  @Post('webhook/chapa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chapa webhook handler (POST) – validates signature and verifies tx_ref',
  })
  @ApiOkResponse({ description: 'Webhook acknowledged' })
  async chapaWebhook(
    @Body() body: ChapaWebhookBody,
    @Headers('chapa-signature') chapaSignature?: string,
    @Headers('x-chapa-signature') xChapaSignature?: string,
    @Headers('Chapa-Signature') chapaSignatureAlt?: string,
  ) {
    const sig = xChapaSignature || chapaSignature || chapaSignatureAlt;
    if (!this.isValidWebhookSignature(body, sig)) {
      // Acknowledge but ignore invalid signatures to avoid retry storms.
      return { ok: true };
    }

    const txRef = this.extractTxRefFromCallbackOrWebhook({ query: {}, body });
    if (txRef) {
      await this.paymentProcessing.verifyAndFinalizeByTxRef(txRef, {
        kind: 'webhook',
        body,
        headers: { chapaSignature: sig ? 'present' : 'missing' },
      });
    }
    return { ok: true };
  }
}

