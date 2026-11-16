
import { describe, expect, it, vi } from 'vitest'

import {
    getAdminDashboardOverview,
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

describe('getAdminDashboardOverview', () => {
    it('should request dashboard overview and preserve the API envelope', async () => {
        const response = {
            success: true,
            data: {
                organizations: {
                    total: 2,
                    byType: {
                        university: 1,
                        bank: 1,
                    },
                    byStatus: {
                        active: 2,
                        suspended: 0,
                        disabled: 0,
                    },
                },
                users: {
                    total: 6,
                    byRole: {
                        systemAdmin: 1,
                        issuerAdmin: 1,
                        verifierAdmin: 1,
                        holder: 3,
                    },
                },
                academicRecords: {
                    total: 2,
                    byStatus: {
                        active: 1,
                        graduated: 1,
                        withdrawn: 0,
                        invalid: 0,
                    },
                },
                credentials: {
                    total: 3,
                    byStatus: {
                        active: 2,
                        suspended: 0,
                        revoked: 1,
                        expired: 0,
                    },
                },
                trustedIssuers: {
                    total: 1,
                    byStatus: {
                        trusted: 1,
                        suspended: 0,
                        revoked: 0,
                    },
                },
                recentActivities: [],
            },
            meta: {
                timestamp: '2026-11-16T12:10:34.452Z',
            },
        }

        const request = vi.fn().mockResolvedValue(response)
        const controller = new AbortController()

        const result = await getAdminDashboardOverview(
            request as unknown as AuthenticatedRequest,
            controller.signal,
        )

        expect(request).toHaveBeenCalledWith(
            {
                method: 'GET',
                url: '/admin/dashboard/overview',
                signal: controller.signal,
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(result).toEqual(response)
    })
})
