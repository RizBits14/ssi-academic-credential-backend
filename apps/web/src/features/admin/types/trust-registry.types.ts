import type { UserRole } from '@/features/auth/types/auth.types'
import type {
    Organization,
    PaginationMeta,
} from '@/features/admin/types/admin.types'

export type TrustedIssuerStatus =
    | 'TRUSTED'
    | 'SUSPENDED'
    | 'REVOKED'

export interface TrustedIssuer {
    id: string
    organizationId: string
    issuerDid: string
    status: TrustedIssuerStatus
    approvedBy: string
    approvedAt: string
    suspendedAt: string | null
    createdAt: string
    updatedAt: string
    organization: Pick<
        Organization,
        'id' | 'name' | 'slug' | 'type' | 'status' | 'email' | 'website'
    >
    approvedByUser: {
        id: string
        name: string
        email: string
        role: UserRole
    }
}

export interface ListTrustedIssuersParams {
    page: number
    limit: number
    status?: TrustedIssuerStatus
    organizationId?: string
}

export interface TrustedIssuersListResponse {
    success: boolean
    data: TrustedIssuer[]
    meta: PaginationMeta
}

export interface CreateTrustedIssuerRequest {
    organizationId: string
    issuerDid: string
}