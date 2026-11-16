import type { UserRole } from '@/features/auth/types/auth.types'
export type OrganizationType = 'UNIVERSITY' | 'BANK'

export type OrganizationStatus =
    | 'ACTIVE'
    | 'SUSPENDED'
    | 'DISABLED'

export interface OrganizationCounts {
    members: number
    academicRecords: number
    credentialSchemas: number
    issuedCredentials: number
    trustedIssuerRegistrations: number
    jobs: number
}

export interface Organization {
    id: string
    name: string
    slug: string
    type: OrganizationType
    email: string | null
    website: string | null
    status: OrganizationStatus
    createdAt: string
    updatedAt: string
    _count: OrganizationCounts
}

export interface PaginationMeta {
    page: number
    limit: number
    total: number
    totalPages: number
    timestamp: string
}

export interface OrganizationListResponse {
    success: boolean
    data: Organization[]
    meta: PaginationMeta
}

export interface ListOrganizationsParams {
    page: number
    limit: number
    search?: string
    type?: OrganizationType
    status?: OrganizationStatus
}


export interface AdminDashboardOverview {
    organizations: {
        total: number
        byType: {
            university: number
            bank: number
        }
        byStatus: {
            active: number
            suspended: number
            disabled: number
        }
    }

    users: {
        total: number
        byRole: {
            systemAdmin: number
            issuerAdmin: number
            verifierAdmin: number
            holder: number
        }
    }

    academicRecords: {
        total: number
        byStatus: {
            active: number
            graduated: number
            withdrawn: number
            invalid: number
        }
    }

    credentials: {
        total: number
        byStatus: {
            active: number
            suspended: number
            revoked: number
            expired: number
        }
    }

    trustedIssuers: {
        total: number
        byStatus: {
            trusted: number
            suspended: number
            revoked: number
        }
    }

    recentActivities: AdminRecentActivity[]
}

export interface AdminRecentActivity {
    id: string
    action: string
    resourceType: string | null
    resourceId: string | null
    createdAt: string
    actor: {
        id: string
        name: string
        role: UserRole
    } | null
    organization: {
        id: string
        name: string
        type: OrganizationType
    } | null
}

export interface AdminDashboardResponse {
    success: boolean
    data: AdminDashboardOverview
    meta: {
        timestamp: string
    }
}
