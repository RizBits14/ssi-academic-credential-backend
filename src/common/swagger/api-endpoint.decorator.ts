import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

const successResponseSchema = {
  type: 'object',
  required: ['success', 'data', 'meta'],
  properties: {
    success: {
      type: 'boolean',
      example: true,
    },
    data: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: true,
        },
        {
          type: 'array',
          items: {},
        },
        {
          type: 'string',
        },
        {
          type: 'number',
        },
        {
          type: 'boolean',
        },
      ],
    },
    meta: {
      type: 'object',
      required: ['timestamp'],
      properties: {
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-16T12:00:00.000Z',
        },
        page: {
          type: 'integer',
          example: 1,
        },
        limit: {
          type: 'integer',
          example: 20,
        },
        total: {
          type: 'integer',
          example: 125,
        },
        totalPages: {
          type: 'integer',
          example: 7,
        },
      },
    },
  },
};

const errorResponseSchema = {
  type: 'object',
  required: ['success', 'error', 'meta'],
  properties: {
    success: {
      type: 'boolean',
      example: false,
    },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          example: 'CREDENTIAL_REVOKED',
        },
        message: {
          type: 'string',
          example: 'The credential has been revoked.',
        },
        details: {
          type: 'array',
          items: {
            type: 'string',
          },
          example: ['academicRecordId must be a UUID'],
        },
      },
    },
    meta: {
      type: 'object',
      required: ['timestamp'],
      properties: {
        timestamp: {
          type: 'string',
          format: 'date-time',
        },
        path: {
          type: 'string',
          example: '/api/v1/credentials/123/status',
        },
        requestId: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
  },
};

function createEndpointDecorator(
  summary: string,
  status: number,
  authenticated: boolean,
) {
  const commonDecorators = [
    ApiOperation({ summary }),
    ApiResponse(
      status === 204
        ? {
            status,
            description: 'Operation completed successfully',
          }
        : {
            status,
            description: 'Successful response',
            schema: successResponseSchema,
          },
    ),
    ApiBadRequestResponse({
      description: 'Invalid request or validation failure',
      schema: errorResponseSchema,
    }),
    ApiNotFoundResponse({
      description: 'Requested resource was not found',
      schema: errorResponseSchema,
    }),
    ApiConflictResponse({
      description: 'Request conflicts with the current resource state',
      schema: errorResponseSchema,
    }),
    ApiUnprocessableEntityResponse({
      description: 'Business or credential verification rule failed',
      schema: errorResponseSchema,
    }),
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded',
      schema: errorResponseSchema,
    }),
    ApiInternalServerErrorResponse({
      description: 'Unexpected server error',
      schema: errorResponseSchema,
    }),
  ];

  if (!authenticated) {
    return applyDecorators(...commonDecorators);
  }

  return applyDecorators(
    ...commonDecorators,
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Authentication is required or token is invalid',
      schema: errorResponseSchema,
    }),
    ApiForbiddenResponse({
      description: 'Authenticated user is not authorized',
      schema: errorResponseSchema,
    }),
  );
}

export function ApiProtectedEndpoint(summary: string, status = 200) {
  return createEndpointDecorator(summary, status, true);
}

export function ApiPublicEndpoint(summary: string, status = 200) {
  return createEndpointDecorator(summary, status, false);
}
