
import type { AxiosRequestConfig } from 'axios'

import type { AuthenticatedRequestOptions } from '@/features/auth/hooks/useAuthenticatedRequest'
import type {
    AdminDashboardResponse,
    ListOrganizationsParams,
    OrganizationListResponse,
} from '@/features/admin/types/admin.types'

export type AuthenticatedRequest = <T>(
    config: AxiosRequestConfig,
    options?: AuthenticatedRequestOptions,
) => Promise<T>

export function getOrganizations(
    request: AuthenticatedRequest,
    params: ListOrganizationsParams,
    signal?: AbortSignal,
) {
    return request<OrganizationListResponse>(
        {
            method: 'GET',
            url: '/organizations',
            params,
            signal,
        },
        {
            responseMode: 'envelope',
        },
    )
}


export function getAdminDashboardOverview(
    request: AuthenticatedRequest,
    signal?: AbortSignal,
) {
    return request<AdminDashboardResponse>(
        {
            method: 'GET',
            url: '/admin/dashboard/overview',
            signal,
        },
        {
            responseMode: 'envelope',
        },
    )
}
