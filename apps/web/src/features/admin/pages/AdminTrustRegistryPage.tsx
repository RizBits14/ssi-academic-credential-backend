import {
    Fragment,
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react'
import { isAxiosError } from 'axios'
import {
    AlertCircle,
    Building2,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Eye,
    Plus,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
} from 'lucide-react'

import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import { getOrganizations } from '@/features/admin/services/admin.service'
import {
    createTrustedIssuer,
    getTrustedIssuers,
    suspendTrustedIssuer,
} from '@/features/admin/services/trust-registry.service'
import type { Organization } from '@/features/admin/types/admin.types'
import type {
    TrustedIssuer,
    TrustedIssuerStatus,
} from '@/features/admin/types/trust-registry.types'

const PAGE_SIZE = 10

type StatusFilter = TrustedIssuerStatus | 'ALL'

interface RegistryRequestState {
    key: string
    issuers: TrustedIssuer[]
    total: number
    totalPages: number
    error: string | null
}

interface UniversitiesRequestState {
    universities: Organization[]
    error: string | null
}

const statusStyles: Record<TrustedIssuerStatus, string> = {
    TRUSTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    SUSPENDED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    REVOKED: 'bg-red-50 text-red-700 ring-red-600/20',
}

function formatDate(value: string | null) {
    if (!value) {
        return 'Not applicable'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
        return (
            error.response?.data?.error?.message ??
            'The request could not be completed.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'The request could not be completed.'
}

function IssuerDetails({
    issuer,
}: {
    issuer: TrustedIssuer
}) {
    const details = [
        {
            label: 'Issuer DID',
            value: issuer.issuerDid,
        },
        {
            label: 'Organization ID',
            value: issuer.organizationId,
        },
        {
            label: 'Organization Email',
            value: issuer.organization.email ?? 'Not provided',
        },
        {
            label: 'Organization Website',
            value: issuer.organization.website ?? 'Not provided',
        },
        {
            label: 'Organization Status',
            value: issuer.organization.status,
        },
        {
            label: 'Approved By',
            value: issuer.approvedByUser.name,
        },
        {
            label: 'Approver Email',
            value: issuer.approvedByUser.email,
        },
        {
            label: 'Approved At',
            value: formatDate(issuer.approvedAt),
        },
        {
            label: 'Suspended At',
            value: formatDate(issuer.suspendedAt),
        },
    ]

    return (
        <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {details.map((detail) => (
                <div key={detail.label} className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                        {detail.label}
                    </p>

                    <p className="mt-1 break-all text-sm font-medium text-slate-800">
                        {detail.value}
                    </p>
                </div>
            ))}
        </div>
    )
}

export default function AdminTrustRegistryPage() {
    const request = useAuthenticatedRequest()

    const [requestState, setRequestState] =
        useState<RegistryRequestState | null>(null)

    const [universitiesState, setUniversitiesState] =
        useState<UniversitiesRequestState | null>(null)

    const [statusFilter, setStatusFilter] =
        useState<StatusFilter>('ALL')

    const [organizationFilter, setOrganizationFilter] = useState('')

    const [page, setPage] = useState(1)
    const [refreshKey, setRefreshKey] = useState(0)
    const [universitiesRefreshKey, setUniversitiesRefreshKey] = useState(0)

    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [confirmSuspendId, setConfirmSuspendId] =
        useState<string | null>(null)

    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newOrganizationId, setNewOrganizationId] = useState('')
    const [newIssuerDid, setNewIssuerDid] = useState('')

    const [isSaving, setIsSaving] = useState(false)
    const [suspendingId, setSuspendingId] = useState<string | null>(null)

    const [actionError, setActionError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const params = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            ...(statusFilter !== 'ALL'
                ? { status: statusFilter }
                : {}),
            ...(organizationFilter
                ? { organizationId: organizationFilter }
                : {}),
        }),
        [page, statusFilter, organizationFilter],
    )

    const queryKey = JSON.stringify({
        ...params,
        refreshKey,
    })

    const currentResult =
        requestState?.key === queryKey ? requestState : null

    const issuers = currentResult?.issuers ?? []
    const total = currentResult?.total ?? 0
    const totalPages = currentResult?.totalPages ?? 0
    const error = currentResult?.error ?? null
    const isLoading = currentResult === null

    const universities = universitiesState?.universities ?? []
    const universitiesError = universitiesState?.error ?? null
    const universitiesLoading = universitiesState === null

    const activeUniversities = universities.filter(
        (organization) => organization.status === 'ACTIVE',
    )

    const trustedOnPage = issuers.filter(
        (issuer) => issuer.status === 'TRUSTED',
    ).length

    const suspendedOnPage = issuers.filter(
        (issuer) => issuer.status === 'SUSPENDED',
    ).length

    useEffect(() => {
        const controller = new AbortController()

        getTrustedIssuers(request, params, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: queryKey,
                    issuers: response.data,
                    total: response.meta.total,
                    totalPages: response.meta.totalPages,
                    error: null,
                })
            })
            .catch((requestError: unknown) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: queryKey,
                    issuers: [],
                    total: 0,
                    totalPages: 0,
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, params, queryKey])

    useEffect(() => {
        const controller = new AbortController()

        getOrganizations(
            request,
            {
                page: 1,
                limit: 100,
                type: 'UNIVERSITY',
            },
            controller.signal,
        )
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setUniversitiesState({
                    universities: response.data,
                    error: null,
                })
            })
            .catch((requestError: unknown) => {
                if (controller.signal.aborted) {
                    return
                }

                setUniversitiesState({
                    universities: [],
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, universitiesRefreshKey])

    function refreshRegistry() {
        setExpandedId(null)
        setConfirmSuspendId(null)
        setActionError(null)
        setRefreshKey((value) => value + 1)
    }

    function changePage(nextPage: number) {
        setExpandedId(null)
        setConfirmSuspendId(null)
        setPage(nextPage)
    }

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (isSaving || !newOrganizationId || !newIssuerDid.trim()) {
            return
        }

        setIsSaving(true)
        setActionError(null)
        setSuccessMessage(null)

        try {
            await createTrustedIssuer(request, {
                organizationId: newOrganizationId,
                issuerDid: newIssuerDid.trim(),
            })

            setSuccessMessage('Trusted issuer registered successfully.')
            setNewOrganizationId('')
            setNewIssuerDid('')
            setShowCreateForm(false)
            setPage(1)
            setRefreshKey((value) => value + 1)
        } catch (requestError) {
            setActionError(getErrorMessage(requestError))
        } finally {
            setIsSaving(false)
        }
    }

    async function handleSuspend(issuerId: string) {
        if (suspendingId) {
            return
        }

        setSuspendingId(issuerId)
        setActionError(null)
        setSuccessMessage(null)

        try {
            await suspendTrustedIssuer(request, issuerId)

            setSuccessMessage('Trusted issuer suspended successfully.')
            setConfirmSuspendId(null)
            setExpandedId(null)
            setRefreshKey((value) => value + 1)
        } catch (requestError) {
            setActionError(getErrorMessage(requestError))
        } finally {
            setSuspendingId(null)
        }
    }

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-violet-700 uppercase">
                        <ShieldCheck className="size-4" />
                        System Administration
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Trusted Issuer Registry
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Manage universities authorized to issue trusted
                        academic credentials.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={refreshRegistry}
                        disabled={isLoading}
                        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw
                            className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                        />
                        Refresh
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setShowCreateForm((value) => !value)
                            setActionError(null)
                        }}
                        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#6D28D9] px-4 text-sm font-medium text-white hover:bg-violet-800"
                    >
                        <Plus className="size-4" />
                        Register Issuer
                    </button>
                </div>
            </div>

            {successMessage && (
                <div
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    {successMessage}
                </div>
            )}

            {actionError && (
                <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {actionError}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                        Registered Issuers
                    </p>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {total.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        Matching the current filters
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                        Trusted Issuers
                    </p>

                    <p className="mt-4 text-2xl font-semibold text-emerald-700">
                        {trustedOnPage.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        On the current page
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                        Suspended Issuers
                    </p>

                    <p className="mt-4 text-2xl font-semibold text-amber-700">
                        {suspendedOnPage.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        On the current page
                    </p>
                </div>
            </div>

            {showCreateForm && (
                <div className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
                    <div className="mb-5">
                        <h2 className="text-base font-semibold text-slate-900">
                            Register Trusted Issuer
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Select an active university and provide its
                            existing organization-owned DID.
                        </p>
                    </div>

                    <form
                        onSubmit={handleCreate}
                        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
                    >
                        <div>
                            <label
                                htmlFor="issuer-organization"
                                className="mb-2 block text-sm font-medium text-slate-700"
                            >
                                University
                            </label>

                            <select
                                id="issuer-organization"
                                required
                                value={newOrganizationId}
                                onChange={(event) =>
                                    setNewOrganizationId(event.target.value)
                                }
                                disabled={universitiesLoading || isSaving}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-600"
                            >
                                <option value="">
                                    Select university
                                </option>

                                {activeUniversities.map((organization) => (
                                    <option
                                        key={organization.id}
                                        value={organization.id}
                                    >
                                        {organization.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="issuer-did"
                                className="mb-2 block text-sm font-medium text-slate-700"
                            >
                                Issuer DID
                            </label>

                            <input
                                id="issuer-did"
                                type="text"
                                required
                                value={newIssuerDid}
                                onChange={(event) =>
                                    setNewIssuerDid(event.target.value)
                                }
                                placeholder="did:example:university"
                                disabled={isSaving}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-600"
                            />
                        </div>

                        <div className="flex items-end">
                            <button
                                type="submit"
                                disabled={
                                    isSaving ||
                                    universitiesLoading ||
                                    !newOrganizationId ||
                                    !newIssuerDid.trim()
                                }
                                className="h-10 w-full cursor-pointer rounded-lg bg-violet-700 px-5 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? 'Registering...' : 'Register'}
                            </button>
                        </div>
                    </form>

                    {universitiesError && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <p className="text-sm text-red-700">
                                {universitiesError}
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    setUniversitiesState(null)
                                    setUniversitiesRefreshKey(
                                        (value) => value + 1,
                                    )
                                }}
                                className="cursor-pointer text-sm font-medium text-violet-700 underline"
                            >
                                Retry loading universities
                            </button>
                        </div>
                    )}

                    {!universitiesLoading &&
                        !universitiesError &&
                        activeUniversities.length === 0 && (
                            <p className="mt-4 text-sm text-amber-700">
                                No active universities are available
                                for registration.
                            </p>
                        )}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center sm:p-5">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            Issuer Records
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Review registered issuers and their trust status.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <select
                            value={statusFilter}
                            onChange={(event) => {
                                setStatusFilter(
                                    event.target.value as StatusFilter,
                                )
                                setPage(1)
                                setExpandedId(null)
                                setConfirmSuspendId(null)
                            }}
                            aria-label="Filter by issuer status"
                            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        >
                            <option value="ALL">All statuses</option>
                            <option value="TRUSTED">Trusted</option>
                            <option value="SUSPENDED">Suspended</option>
                            <option value="REVOKED">Revoked</option>
                        </select>

                        <select
                            value={organizationFilter}
                            onChange={(event) => {
                                setOrganizationFilter(event.target.value)
                                setPage(1)
                                setExpandedId(null)
                                setConfirmSuspendId(null)
                            }}
                            aria-label="Filter by university"
                            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        >
                            <option value="">All universities</option>

                            {universities.map((organization) => (
                                <option
                                    key={organization.id}
                                    value={organization.id}
                                >
                                    {organization.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div
                        role="alert"
                        className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
                    >
                        <div className="flex items-start gap-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            {error}
                        </div>

                        <button
                            type="button"
                            onClick={refreshRegistry}
                            className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700"
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[950px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50">
                            <tr>
                                {[
                                    'University',
                                    'Issuer DID',
                                    'Status',
                                    'Approved By',
                                    'Registered',
                                    'Actions',
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        scope="col"
                                        className="px-5 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center"
                                    >
                                        <RefreshCw className="mx-auto size-6 animate-spin text-violet-600" />

                                        <p className="mt-3 text-sm text-slate-500">
                                            Loading trusted issuers...
                                        </p>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-12 text-center text-sm text-slate-500"
                                    >
                                        Issuer records could not be loaded.
                                    </td>
                                </tr>
                            ) : issuers.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center"
                                    >
                                        <ShieldCheck className="mx-auto size-8 text-slate-300" />

                                        <p className="mt-3 text-sm font-medium text-slate-700">
                                            No trusted issuer records found
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Try changing your filters or
                                            registering an eligible issuer.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                issuers.map((issuer) => (
                                    <Fragment key={issuer.id}>
                                        <tr className="hover:bg-slate-50/70">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                                        <Building2 className="size-5 text-violet-700" />
                                                    </div>

                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-900">
                                                            {issuer.organization.name}
                                                        </p>

                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {issuer.organization.slug}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="max-w-64 px-5 py-4">
                                                <p className="break-all text-xs text-slate-600">
                                                    {issuer.issuerDid}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[issuer.status]}`}
                                                >
                                                    {issuer.status}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p className="text-sm text-slate-800">
                                                    {issuer.approvedByUser.name}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                    {issuer.approvedByUser.role}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                                {formatDate(issuer.createdAt)}
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        aria-expanded={expandedId === issuer.id}
                                                        onClick={() =>
                                                            setExpandedId(
                                                                expandedId === issuer.id
                                                                    ? null
                                                                    : issuer.id,
                                                            )
                                                        }
                                                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                    >
                                                        <Eye className="size-3.5" />
                                                        {expandedId === issuer.id
                                                            ? 'Close'
                                                            : 'View'}
                                                    </button>

                                                    {issuer.status === 'TRUSTED' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setConfirmSuspendId(
                                                                    confirmSuspendId === issuer.id
                                                                        ? null
                                                                        : issuer.id,
                                                                )
                                                                setActionError(null)
                                                            }}
                                                            disabled={suspendingId !== null}
                                                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                                                        >
                                                            <ShieldOff className="size-3.5" />
                                                            Suspend
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {expandedId === issuer.id && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-5 py-4"
                                                >
                                                    <IssuerDetails issuer={issuer} />
                                                </td>
                                            </tr>
                                        )}

                                        {confirmSuspendId === issuer.id && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-5 py-4"
                                                >
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                                                        <p className="text-sm font-semibold text-amber-900">
                                                            Suspend this trusted issuer?
                                                        </p>

                                                        <p className="mt-2 text-sm text-amber-800">
                                                            Suspending this issuer changes
                                                            its trust status and may affect
                                                            credential verification.
                                                            There is currently no
                                                            reactivation endpoint.
                                                        </p>

                                                        <div className="mt-4 flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleSuspend(issuer.id)
                                                                }
                                                                disabled={suspendingId !== null}
                                                                className="cursor-pointer rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                                                            >
                                                                {suspendingId === issuer.id
                                                                    ? 'Suspending...'
                                                                    : 'Confirm Suspension'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setConfirmSuspendId(null)
                                                                }
                                                                disabled={suspendingId !== null}
                                                                className="cursor-pointer rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <p className="text-xs text-slate-500">
                        {total === 0
                            ? 'No records to display'
                            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} issuers`}
                    </p>

                    <div className="flex items-center gap-2">
                        <span className="mr-2 text-xs text-slate-500">
                            Page {page} of {Math.max(totalPages, 1)}
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                changePage(Math.max(1, page - 1))
                            }
                            disabled={page <= 1 || isLoading}
                            aria-label="Previous page"
                            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronLeft className="size-4" />
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                changePage(Math.min(totalPages, page + 1))
                            }
                            disabled={
                                totalPages === 0 ||
                                page >= totalPages ||
                                isLoading
                            }
                            aria-label="Next page"
                            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    )
}