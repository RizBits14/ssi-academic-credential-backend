import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from './admin.service'
import {
    getAdminUserDetails,
    getAdminUsers,
} from './users.service'

describe('Admin users service', () => {
    it('requests paginated users with search and role filters', async () => {
        const response = {
            success: true,
            data: [],
            meta: {
                page: 2,
                limit: 10,
                total: 0,
                totalPages: 0,
                timestamp: '2026-11-20T00:00:00.000Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const params = {
            page: 2,
            limit: 10,
            search: 'nora',
            role: 'HOLDER' as const,
        }

        const result = await getAdminUsers(
            request as unknown as AuthenticatedRequest,
            params,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/users',
                params,
                signal: controller.signal,
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(result).toEqual(response)
    })

    it('requests details for a specific user', async () => {
        const userId = '7281f983-9c35-4c58-acc9-e6fd9fb7d0df'

        const response = {
            id: userId,
            name: 'Nora Ellis',
            email: 'nora@example.com',
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const result = await getAdminUserDetails(
            request as unknown as AuthenticatedRequest,
            userId,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith({
            method: 'GET',
            url: `/users/${userId}`,
            signal: controller.signal,
        })

        expect(result).toEqual(response)
    })
})