import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rawResponse = this.reflector.getAllAndOverride<boolean>(
      RAW_RESPONSE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (rawResponse) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        if (body === undefined) {
          return undefined;
        }

        const timestamp = new Date().toISOString();

        if (this.isPaginatedResult(body)) {
          return {
            success: true,
            data: body.data,
            meta: {
              ...body.meta,
              timestamp,
            },
          };
        }

        return {
          success: true,
          data: body,
          meta: {
            timestamp,
          },
        };
      }),
    );
  }

  private isPaginatedResult(value: unknown): value is {
    data: unknown;
    meta: Record<string, unknown>;
  } {
    return (
      this.isRecord(value) &&
      Object.prototype.hasOwnProperty.call(value, 'data') &&
      this.isRecord(value.meta)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
