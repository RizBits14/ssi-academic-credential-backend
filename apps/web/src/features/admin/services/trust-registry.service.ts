import type { AuthenticatedRequest } from '@/features/admin/services/admin.service'
import type {
    CreateTrustedIssuerRequest,
    ListTrustedIssuersParams,
    TrustedIssuer,
    TrustedIssuersListResponse,
} from '@/features/admin/types/trust-registry.types'

export function getTrustedIssuers(
    request: AuthenticatedRequest,
    params: ListTrustedIssuersParams,
    signal?: AbortSignal,
) {
    return request<TrustedIssuersListResponse>(
        {
            method: 'GET',
            url: '/trust-registry/issuers',
            params,
            signal,
        },
        {
            responseMode: 'envelope',
        },
    )
}

export function createTrustedIssuer(
    request: AuthenticatedRequest,
    data: CreateTrustedIssuerRequest,
) {
    return request<TrustedIssuer>({
        method: 'POST',
        url: '/trust-registry/issuers',
        data,
    })
}

export function suspendTrustedIssuer(
    request: AuthenticatedRequest,
    issuerId: string,
) {
    return request<TrustedIssuer>({
        method: 'PATCH',
        url: `/trust-registry/issuers/${encodeURIComponent(issuerId)}/suspend`,
    })
}