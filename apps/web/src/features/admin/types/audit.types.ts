import type { PaginationMeta } from '@/features/admin/types/admin.types'

export interface AuditLog {
    id: string
    actorId: string | null
    organizationId: string | null
    action: string
    resourceType: string | null
    resourceId: string | null
    metadata: unknown | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
}

export interface ListAuditLogsParams {
    page: number
    limit: number
    action?: string
}

export interface AuditLogsListResponse {
    success: boolean
    data: AuditLog[]
    meta: PaginationMeta
}