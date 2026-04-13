import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';

export interface ChapaInitializePaymentDto {
  amount: string;
  currency: 'ETB' | 'USD';
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  tx_ref: string;
  callback_url?: string;
  return_url?: string;
  customization?: {
    title?: string;
    description?: string;
  };
}

export interface ChapaInitializeResponse {
  status: string;
  message: string;
  data: {
    checkout_url: string;
  };
}

export interface ChapaTransferDto {
  account_name: string;
  account_number: string;
  amount: string;
  currency: 'ETB' | 'USD';
  reference: string;
  bank_code: number; // Must be numeric according to Chapa API
}

export interface ChapaTransferResponse {
  status: string;
  message: string;
  data: {
    reference: string;
    [key: string]: any;
  };
}

export interface ChapaTransferVerificationResponse {
  status: string;
  message: string;
  data: {
    reference: string;
    status: string;
    [key: string]: any;
  };
}

export interface ChapaBank {
  id?: number;
  name?: string;
  code?: number | string;
  bank_code?: number | string;
  [key: string]: any;
}

export interface ChapaBanksResponse {
  status: string;
  message: string;
  data: ChapaBank[];
}

@Injectable()
export class ChapaService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.chapa.co/v1';
  private readonly callbackUrl: string;
  private readonly returnUrl: string;
  private readonly transferApprovalSecret: string;

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('CHAPA_SECRET_KEY') || '';
    this.callbackUrl =
      this.configService.get<string>('CHAPA_CALLBACK_URL') ||
      `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/api/v1/payments/webhook/chapa`;
    this.returnUrl =
      this.configService.get<string>('CHAPA_RETURN_URL') ||
      `${this.configService.get<string>('APP_URL') || 'http://localhost:3001'}/payment-success`;
    this.transferApprovalSecret =
      this.configService.get<string>('CHAPA_TRANSFER_APPROVAL_SECRET') || '';

    if (!this.secretKey) {
      console.warn('CHAPA_SECRET_KEY is not set. Chapa payments will not work.');
    }
    if (!this.transferApprovalSecret) {
      console.warn('CHAPA_TRANSFER_APPROVAL_SECRET is not set. Transfer approval webhook will not work.');
    }
  }

  async initializePayment(
    payload: ChapaInitializePaymentDto,
  ): Promise<ChapaInitializeResponse> {
    try {
      const response = await axios.post<ChapaInitializeResponse>(
        `${this.baseUrl}/transaction/initialize`,
        {
          ...payload,
          callback_url: payload.callback_url || this.callbackUrl,
          return_url: payload.return_url || this.returnUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          'Failed to initialize Chapa payment';
        throw new BadRequestException(errorMessage);
      }
      throw new BadRequestException('Failed to initialize Chapa payment');
    }
  }

  async verifyTransaction(txRef: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction/verify/${txRef}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          'Failed to verify Chapa transaction';
        throw new BadRequestException(errorMessage);
      }
      throw new BadRequestException('Failed to verify Chapa transaction');
    }
  }

  async initiateTransfer(
    payload: ChapaTransferDto,
  ): Promise<ChapaTransferResponse> {
    try {
      const response = await axios.post<ChapaTransferResponse>(
        `${this.baseUrl}/transfers`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data;
        let errorMessage = 'Failed to initiate Chapa transfer';
        
        if (errorData) {
          // Handle validation errors
          if (errorData.bank_code) {
            errorMessage = `Invalid bank code: ${Array.isArray(errorData.bank_code) ? errorData.bank_code.join(', ') : errorData.bank_code}`;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new BadRequestException(errorMessage);
      }
      throw new BadRequestException('Failed to initiate Chapa transfer');
    }
  }

  async verifyTransfer(
    txRef: string,
  ): Promise<ChapaTransferVerificationResponse> {
    try {
      const response = await axios.get<ChapaTransferVerificationResponse>(
        `${this.baseUrl}/transfers/verify/${txRef}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          'Failed to verify Chapa transfer';
        throw new BadRequestException(errorMessage);
      }
      throw new BadRequestException('Failed to verify Chapa transfer');
    }
  }

  validateTransferApprovalSignature(
    payload: any,
    signature: string,
  ): boolean {
    if (!this.transferApprovalSecret) {
      return false;
    }

    try {
      // Create HMAC SHA256 signature
      const hmac = crypto.createHmac('sha256', this.transferApprovalSecret);
      const payloadString = JSON.stringify(payload);
      hmac.update(payloadString);
      const calculatedSignature = hmac.digest('hex');

      // Compare signatures using constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(calculatedSignature),
      );
    } catch (error) {
      console.error('Error validating transfer approval signature:', error);
      return false;
    }
  }

  handleTransferApprovalWebhook(
    payload: any,
    signature: string,
  ): { approved: boolean; reason?: string } {
    const isValid = this.validateTransferApprovalSignature(payload, signature);

    if (!isValid) {
      return {
        approved: false,
        reason: 'Invalid signature',
      };
    }

    // Additional validation logic can be added here
    // For now, if signature is valid, approve the transfer
    return {
      approved: true,
    };
  }

  async getBanks(): Promise<ChapaBanksResponse> {
    try {
      // Chapa API endpoint: GET /v1/banks
      // Documentation: https://developer.chapa.co/transfer/list-banks
      const response = await axios.get<ChapaBanksResponse>(
        `${this.baseUrl}/banks`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      // Log response for debugging
      console.log('Chapa banks API response:', JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('Chapa banks API error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'Failed to fetch banks from Chapa';
        throw new BadRequestException(errorMessage);
      }
      console.error('Unexpected error fetching banks:', error);
      throw new BadRequestException('Failed to fetch banks from Chapa');
    }
  }
}

