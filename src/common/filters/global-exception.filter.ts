import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ErrorCode } from '../constants/error-code';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const requestId =
      typeof request.id === 'string'
        ? request.id
        : typeof request.id === 'number'
          ? request.id.toString()
          : undefined;

    const extracted = this.extractError(exception);

    response.status(extracted.status).json({
      success: false,

      error: {
        code: this.resolveErrorCode(extracted.status, extracted.message),

        message: extracted.message,

        ...(extracted.details
          ? {
              details: extracted.details,
            }
          : {}),
      },

      meta: {
        timestamp: new Date().toISOString(),
        path: request.originalUrl,

        ...(requestId
          ? {
              requestId,
            }
          : {}),
      },
    });
  }

  private extractError(exception: unknown): {
    status: number;
    message: string;
    details?: string[];
  } {
    if (!(exception instanceof HttpException)) {
      return {
        status: 500,
        message: 'Unexpected server error',
      };
    }

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return {
        status,
        message: exceptionResponse,
      };
    }

    if (!this.isRecord(exceptionResponse)) {
      return {
        status,
        message: exception.message,
      };
    }

    const rawMessage = exceptionResponse.message;

    if (Array.isArray(rawMessage)) {
      const details = rawMessage.filter(
        (message): message is string => typeof message === 'string',
      );

      return {
        status,
        message: 'Validation failed',
        details,
      };
    }

    if (typeof rawMessage === 'string') {
      return {
        status,
        message: rawMessage,
      };
    }

    return {
      status,
      message: exception.message,
    };
  }

  private resolveErrorCode(status: number, message: string): ErrorCode {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid email or password')) {
      return ErrorCode.AUTH_INVALID_CREDENTIALS;
    }

    if (normalized.includes('access token is required')) {
      return ErrorCode.AUTH_TOKEN_REQUIRED;
    }

    if (
      normalized.includes('invalid or expired access token') ||
      normalized.includes('invalid refresh token') ||
      normalized.includes('refresh token has expired')
    ) {
      return ErrorCode.AUTH_TOKEN_EXPIRED;
    }

    if (normalized.includes('academic record not found')) {
      return ErrorCode.ACADEMIC_RECORD_NOT_FOUND;
    }

    if (normalized.includes('did not found')) {
      return ErrorCode.DID_NOT_FOUND;
    }

    if (
      normalized.includes('credential not found') ||
      normalized.includes('wallet credential not found')
    ) {
      return ErrorCode.CREDENTIAL_NOT_FOUND;
    }

    if (normalized.includes('job not found')) {
      return ErrorCode.JOB_NOT_FOUND;
    }

    if (normalized.includes('application not found')) {
      return ErrorCode.APPLICATION_NOT_FOUND;
    }

    if (normalized.includes('verification request not found')) {
      return ErrorCode.VERIFICATION_REQUEST_NOT_FOUND;
    }

    if (normalized.includes('credential') && normalized.includes('revoked')) {
      return ErrorCode.CREDENTIAL_REVOKED;
    }

    if (normalized.includes('credential') && normalized.includes('suspended')) {
      return ErrorCode.CREDENTIAL_SUSPENDED;
    }

    if (normalized.includes('credential') && normalized.includes('expired')) {
      return ErrorCode.CREDENTIAL_EXPIRED;
    }

    if (normalized.includes('signature') && normalized.includes('invalid')) {
      return ErrorCode.INVALID_CREDENTIAL_SIGNATURE;
    }

    if (
      normalized.includes('issuer not trusted') ||
      normalized.includes('issuer is not trusted')
    ) {
      return ErrorCode.ISSUER_NOT_TRUSTED;
    }

    if (
      normalized.includes('verification request') &&
      normalized.includes('expired')
    ) {
      return ErrorCode.VERIFICATION_REQUEST_EXPIRED;
    }

    if (
      normalized.includes('no longer pending') ||
      normalized.includes('already been used') ||
      normalized.includes('already consumed')
    ) {
      return ErrorCode.VERIFICATION_REQUEST_USED;
    }

    if (normalized.includes('nonce')) {
      return ErrorCode.INVALID_NONCE;
    }

    if (normalized.includes('subset of requested claims')) {
      return ErrorCode.CLAIM_NOT_REQUESTED;
    }

    if (normalized.includes('claim') && normalized.includes('mismatch')) {
      return ErrorCode.CLAIM_MISMATCH;
    }

    if (normalized.includes('holder') && normalized.includes('mismatch')) {
      return ErrorCode.HOLDER_MISMATCH;
    }

    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;

      case 403:
        return ErrorCode.ACCESS_DENIED;

      case 404:
        return ErrorCode.RESOURCE_NOT_FOUND;

      case 409:
        return ErrorCode.CONFLICT;

      case 422:
        return ErrorCode.BUSINESS_RULE_VIOLATION;

      case 429:
        return ErrorCode.RATE_LIMITED;

      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
