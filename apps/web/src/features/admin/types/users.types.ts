import type { UserRole } from '@/features/auth/types/auth.types'
import type {
    OrganizationStatus,
    OrganizationType,
    PaginationMeta,
} from '@/features/admin/types/admin.types'

export interface AdminUser {
    id: string
    name: string
    email: string
    role: UserRole
    createdAt: string
    updatedAt: string
    _count: {
        organizationMemberships: number
        academicRecords: number
        credentials: number
        applications: number
    }
}

export interface AdminUserMembership {
    id: string
    createdAt: string
    organization: {
        id: string
        name: string
        slug: string
        type: OrganizationType
        status: OrganizationStatus
    }
}

export interface AdminUserActivity {
    id: string
    action: string
    resourceType: string | null
    resourceId: string | null
    organizationId: string | null
    createdAt: string
}

export interface AdminUserDetails extends Omit<AdminUser, '_count'> {
    organizationMemberships: AdminUserMembership[]
    _count: AdminUser['_count'] & {
        walletCredentials: number
        verificationRequestsCreated: number
        verificationRequestsReceived: number
        presentations: number
    }
    recentActivities: AdminUserActivity[]
}

export interface ListUsersParams {
    page: number
    limit: number
    search?: string
    role?: UserRole
}

export interface AdminUsersListResponse {
    success: boolean
    data: AdminUser[]
    meta: PaginationMeta
}