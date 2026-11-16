
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
    AlertCircle,
    Building2,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    GraduationCap,
    RefreshCw,
    Search,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { isAxiosError } from 'axios'

import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import { getOrganizations } from '@/features/admin/services/admin.service'
import type {
    Organization,
    OrganizationStatus,
    OrganizationType,
} from '@/features/admin/types/admin.types'

const PAGE_SIZE = 10

type TypeFilter = OrganizationType | 'ALL'
type StatusFilter = OrganizationStatus | 'ALL'

interface OrganizationsRequestState {
    key: string
    organizations: Organization[]
    total: number
    totalPages: number
    error: string | null
}

const statusStyles: Record<OrganizationStatus, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    SUSPENDED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    DISABLED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value))
}

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
        return (
            error.response?.data?.error?.message ??
            'Unable to load organizations. Please try again.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'Unable to load organizations.'
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
}: {
    title: string
    value: number
    description: string
    icon: LucideIcon
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-500">
                    {title}
                </p>

                <div className="flex size-10 items-center justify-center rounded-lg bg-violet-50">
                    <Icon className="size-5 text-[#6D28D9]" />
                </div>
            </div>

            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                {value.toLocaleString()}
            </p>

            <p className="mt-1 text-xs text-slate-500">
                {description}
            </p>
        </div>
    )
}

function OrganizationDetails({
    organization,
}: {
    organization: Organization
}) {
    const details = [
        {
            label: 'Organization slug',
            value: organization.slug,
        },
        {
            label: 'Email address',
            value: organization.email ?? 'Not provided',
        },
        {
            label: 'Website',
            value: organization.website ?? 'Not provided',
        },
        {
            label: 'Academic records',
            value: organization._count.academicRecords,
        },
        {
            label: 'Credential schemas',
            value: organization._count.credentialSchemas,
        },
        {
            label: 'Trusted issuer registrations',
            value: organization._count.trustedIssuerRegistrations,
        },
        {
            label: 'Recruitment jobs',
            value: organization._count.jobs,
        },
        {
            label: 'Last updated',
            value: formatDate(organization.updatedAt),
        },
    ]

    return (
        <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {details.map((item) => (
                <div key={item.label} className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                        {item.label}
                    </p>

                    <p className="mt-1 break-all text-sm font-medium text-slate-800">
                        {item.value}
                    </p>
                </div>
            ))}
        </div>
    )
}

export default function AdminOrganizationsPage() {
    const request = useAuthenticatedRequest()

    const [requestState, setRequestState] =
        useState<OrganizationsRequestState | null>(null)

    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')

    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

    const [page, setPage] = useState(1)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    const params = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            ...(search ? { search } : {}),
            ...(typeFilter !== 'ALL' ? { type: typeFilter } : {}),
            ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        }),
        [page, search, typeFilter, statusFilter],
    )

    const queryKey = JSON.stringify({
        ...params,
        refreshKey,
    })

    const currentResult =
        requestState?.key === queryKey ? requestState : null

    const organizations = currentResult?.organizations ?? []
    const total = currentResult?.total ?? 0
    const totalPages = currentResult?.totalPages ?? 0
    const isLoading = currentResult === null
    const error = currentResult?.error ?? null

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, 350)

        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        const controller = new AbortController()

        getOrganizations(request, params, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: queryKey,
                    organizations: response.data,
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
                    organizations: [],
                    total: 0,
                    totalPages: 0,
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, params, queryKey])

    const universityCount = organizations.filter(
        (organization) => organization.type === 'UNIVERSITY',
    ).length

    const bankCount = organizations.filter(
        (organization) => organization.type === 'BANK',
    ).length

    const activeCount = organizations.filter(
        (organization) => organization.status === 'ACTIVE',
    ).length

    const hasFilters =
        searchInput.trim().length > 0 ||
        typeFilter !== 'ALL' ||
        statusFilter !== 'ALL'

    function clearFilters() {
        setSearchInput('')
        setSearch('')
        setTypeFilter('ALL')
        setStatusFilter('ALL')
        setPage(1)
        setExpandedId(null)
    }

    function refreshOrganizations() {
        setExpandedId(null)
        setRefreshKey((value) => value + 1)
    }

    function changePage(nextPage: number) {
        setExpandedId(null)
        setPage(nextPage)
    }

    return (
        <section className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#6D28D9] uppercase">
                        <Building2 className="size-4" />
                        System Administration
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Organization Management
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        View and monitor universities and recruiting
                        organizations registered on the platform.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={refreshOrganizations}
                    disabled={isLoading}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total Organizations"
                    value={total}
                    description="Across the entire platform"
                    icon={Building2}
                />

                <StatCard
                    title="Universities"
                    value={universityCount}
                    description="On the current page"
                    icon={GraduationCap}
                />

                <StatCard
                    title="Banks"
                    value={bankCount}
                    description="On the current page"
                    icon={Building2}
                />

                <StatCard
                    title="Active Organizations"
                    value={activeCount}
                    description="On the current page"
                    icon={Users}
                />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                Registered Organizations
                            </h2>

                            <p className="mt-1 text-sm text-slate-500">
                                Search and filter platform organizations.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative min-w-0 sm:w-64">
                                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />

                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(event) => {
                                        setSearchInput(event.target.value)
                                        setExpandedId(null)
                                    }}
                                    placeholder="Search name or slug..."
                                    aria-label="Search organizations"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 outline-none transition focus:border-[#6D28D9] focus:ring-2 focus:ring-violet-100"
                                />
                            </div>

                            <select
                                value={typeFilter}
                                onChange={(event) => {
                                    setTypeFilter(event.target.value as TypeFilter)
                                    setPage(1)
                                    setExpandedId(null)
                                }}
                                aria-label="Filter by organization type"
                                className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-violet-100"
                            >
                                <option value="ALL">All types</option>
                                <option value="UNIVERSITY">Universities</option>
                                <option value="BANK">Banks</option>
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(event) => {
                                    setStatusFilter(event.target.value as StatusFilter)
                                    setPage(1)
                                    setExpandedId(null)
                                }}
                                aria-label="Filter by organization status"
                                className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-violet-100"
                            >
                                <option value="ALL">All statuses</option>
                                <option value="ACTIVE">Active</option>
                                <option value="SUSPENDED">Suspended</option>
                                <option value="DISABLED">Disabled</option>
                            </select>
                        </div>
                    </div>

                    {hasFilters && (
                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#6D28D9] hover:text-violet-800"
                            >
                                Clear all filters
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>
                    )}
                </div>

                {error && (
                    <div
                        role="alert"
                        className="m-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />

                            <div>
                                <p className="text-sm font-medium text-red-800">
                                    Unable to load organizations
                                </p>

                                <p className="mt-1 text-sm text-red-700">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={refreshOrganizations}
                            className="h-9 cursor-pointer rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left">
                        <thead className="bg-slate-50">
                            <tr className="border-b border-slate-200">
                                {[
                                    'Organization',
                                    'Type',
                                    'Status',
                                    'Members',
                                    'Credentials',
                                    'Registered',
                                    'Details',
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
                                        colSpan={7}
                                        className="px-5 py-16 text-center"
                                    >
                                        <RefreshCw className="mx-auto size-6 animate-spin text-[#6D28D9]" />

                                        <p className="mt-3 text-sm text-slate-500">
                                            Loading organizations...
                                        </p>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-5 py-12 text-center text-sm text-slate-500"
                                    >
                                        Organization data could not be loaded.
                                    </td>
                                </tr>
                            ) : organizations.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-5 py-16 text-center"
                                    >
                                        <Building2 className="mx-auto size-8 text-slate-300" />

                                        <p className="mt-3 text-sm font-medium text-slate-700">
                                            No organizations found
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            {hasFilters
                                                ? 'Try changing your search or filters.'
                                                : 'No organizations have been registered yet.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                organizations.map((organization) => (
                                    <Fragment key={organization.id}>
                                        <tr className="transition-colors hover:bg-slate-50/70">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                                        <Building2 className="size-5 text-[#6D28D9]" />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-900">
                                                            {organization.name}
                                                        </p>

                                                        <p className="mt-1 truncate text-xs text-slate-500">
                                                            {organization.slug}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <span className="text-sm text-slate-700">
                                                    {organization.type === 'UNIVERSITY'
                                                        ? 'University'
                                                        : 'Bank'}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[organization.status]}`}
                                                >
                                                    {organization.status}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4 text-sm tabular-nums text-slate-700">
                                                {organization._count.members.toLocaleString()}
                                            </td>

                                            <td className="px-5 py-4 text-sm tabular-nums text-slate-700">
                                                {organization._count.issuedCredentials.toLocaleString()}
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                                {formatDate(organization.createdAt)}
                                            </td>

                                            <td className="px-5 py-4">
                                                <button
                                                    type="button"
                                                    aria-expanded={expandedId === organization.id}
                                                    onClick={() =>
                                                        setExpandedId(
                                                            expandedId === organization.id
                                                                ? null
                                                                : organization.id,
                                                        )
                                                    }
                                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-[#6D28D9]"
                                                >
                                                    <Eye className="size-3.5" />
                                                    {expandedId === organization.id
                                                        ? 'Close'
                                                        : 'View'}
                                                </button>
                                            </td>
                                        </tr>

                                        {expandedId === organization.id && (
                                            <tr>
                                                <td colSpan={7} className="px-5 py-4">
                                                    <OrganizationDetails
                                                        organization={organization}
                                                    />
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
                            : `Showing ${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} organizations`}
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
                            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronLeft className="size-4" />
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                changePage(Math.min(totalPages, page + 1))
                            }
                            disabled={totalPages === 0 || page >= totalPages || isLoading}
                            aria-label="Next page"
                            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 p-4">
                <FileText className="mt-0.5 size-4 shrink-0 text-[#6D28D9]" />

                <p className="text-xs leading-5 text-slate-600">
                    Organization records are currently displayed in read-only
                    mode. Creation, editing, and suspension workflows will be
                    connected when their administrative APIs are available.
                </p>
            </div>
        </section>
    )
}
