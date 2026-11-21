import type { AuthenticatedRequest } from '@/features/admin/services/admin.service'
import type {
    AuditLogsListResponse,
    ListAuditLogsParams,
} from '@/features/admin/types/audit.types'

export function getAuditLogs(
    request: AuthenticatedRequest,
    params: ListAuditLogsParams,
    signal?: AbortSignal,
) {
    return request<AuditLogsListResponse>(
        {
            method: 'GET',
            url: '/audit-logs',
            params,
            signal,
        },
        {
            responseMode: 'envelope',
        },
    )
}