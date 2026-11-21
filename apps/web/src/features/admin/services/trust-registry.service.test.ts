import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from './admin.service'
import {
    createTrustedIssuer,
    getTrustedIssuers,
    suspendTrustedIssuer,
} from './trust-registry.service'

describe('Trust registry service', () => {
    it('requests trusted issuers with pagination and filters', async () => {
        const response = {
            success: true,
            data: [],
            meta: {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 0,
                timestamp: '2026-11-21T00:00:00.000Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const params = {
            page: 1,
            limit: 10,
            status: 'TRUSTED' as const,
            organizationId: '4c556b54-9dda-417f-82f6-a353e17ee464',
        }

        const result = await getTrustedIssuers(
            request as unknown as AuthenticatedRequest,
            params,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/trust-registry/issuers',
                params,
                signal: controller.signal,
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(result).toEqual(response)
    })

    it('registers a trusted issuer', async () => {
        const data = {
            organizationId: '4c556b54-9dda-417f-82f6-a353e17ee464',
            issuerDid: 'did:example:university',
        }

        const request = vi.fn().mockResolvedValue({
            id: 'trusted-issuer-id',
        })

        await createTrustedIssuer(
            request as unknown as AuthenticatedRequest,
            data,
        )

        expect(request).toHaveBeenCalledWith({
            method: 'POST',
            url: '/trust-registry/issuers',
            data,
        })
    })

    it('suspends an issuer by ID', async () => {
        const issuerId = '4c556b54-9dda-417f-82f6-a353e17ee464'
        const request = vi.fn().mockResolvedValue({
            status: 'SUSPENDED',
        })

        await suspendTrustedIssuer(
            request as unknown as AuthenticatedRequest,
            issuerId,
        )

        expect(request).toHaveBeenCalledWith({
            method: 'PATCH',
            url: `/trust-registry/issuers/${issuerId}/suspend`,
        })
    })
})