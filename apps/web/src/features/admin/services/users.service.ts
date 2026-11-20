import type { AuthenticatedRequest } from '@/features/admin/services/admin.service'
import type {
    AdminUserDetails,
    AdminUsersListResponse,
    ListUsersParams,
} from '@/features/admin/types/users.types'

export function getAdminUsers(
    request: AuthenticatedRequest,
    params: ListUsersParams,
    signal?: AbortSignal,
) {
    return request<AdminUsersListResponse>(
        {
            method: 'GET',
            url: '/users',
            params,
            signal,
        },
        {
            responseMode: 'envelope',
        },
    )
}

export function getAdminUserDetails(
    request: AuthenticatedRequest,
    userId: string,
    signal?: AbortSignal,
) {
    return request<AdminUserDetails>({
        method: 'GET',
        url: `/users/${encodeURIComponent(userId)}`,
        signal,
    })
}