
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
