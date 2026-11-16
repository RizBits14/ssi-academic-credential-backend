
import { describe, expect, it, vi } from 'vitest'

import {
    getOrganizations,
    type AuthenticatedRequest,
} from './admin.service'

describe('getOrganizations', () => {
    it('should send pagination and filters and preserve the API envelope', async () => {
        const response = {
            success: true,
            data: [],
            meta: {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 0,
                timestamp: '2026-11-16T06:42:43.510Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const params = {
            page: 1,
            limit: 10,
            search: 'north',
            type: 'UNIVERSITY' as const,
            status: 'ACTIVE' as const,
        }

        const result = await getOrganizations(
            request as unknown as AuthenticatedRequest,
            params,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/organizations',
                params,
                signal: controller.signal,
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(result).toEqual(response)
    })
})
