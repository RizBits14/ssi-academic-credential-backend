import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from './admin.service'
import { getAuditLogs } from './audit.service'

describe('getAuditLogs', () => {
    it('requests paginated audit logs with an action filter', async () => {
        const response = {
            success: true,
            data: [],
            meta: {
                page: 2,
                limit: 20,
                total: 0,
                totalPages: 0,
                timestamp: '2026-11-21T00:00:00.000Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const params = {
            page: 2,
            limit: 20,
            action: 'LOGIN',
        }

        const result = await getAuditLogs(
            request as unknown as AuthenticatedRequest,
            params,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/audit-logs',
                params,
                signal: controller.signal,
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(result).toEqual(response)
    })

    it('requests audit logs without an action filter', async () => {
        const response = {
            success: true,
            data: [],
            meta: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0,
                timestamp: '2026-11-21T00:00:00.000Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)

        const params = {
            page: 1,
            limit: 20,
        }

        await getAuditLogs(
            request as unknown as AuthenticatedRequest,
            params,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/audit-logs',
                params,
                signal: undefined,
            },
            {
                responseMode: 'envelope',
            },
        )
    })
})