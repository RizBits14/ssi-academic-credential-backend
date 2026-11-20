import { Fragment, useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Eye,
    RefreshCw,
    Search,
    ShieldCheck,
    UserRound,
    Users,
} from 'lucide-react'

import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import { getAdminUsers } from '@/features/admin/services/users.service'
import AdminUserDetailsPanel from '@/features/admin/components/AdminUserDetailsPanel'
import type { AdminUser } from '@/features/admin/types/users.types'
import type { UserRole } from '@/features/auth/types/auth.types'

const PAGE_SIZE = 10

type RoleFilter = UserRole | 'ALL'

interface UsersRequestState {
    key: string
    users: AdminUser[]
    total: number
    totalPages: number
    error: string | null
}

const roleLabels: Record<UserRole, string> = {
    SYSTEM_ADMIN: 'System Administrator',
    ISSUER_ADMIN: 'University Administrator',
    VERIFIER_ADMIN: 'Bank Administrator',
    HOLDER: 'Credential Holder',
}

const roleStyles: Record<UserRole, string> = {
    SYSTEM_ADMIN: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    ISSUER_ADMIN: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    VERIFIER_ADMIN: 'bg-teal-50 text-teal-700 ring-teal-600/20',
    HOLDER: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function formatDate(value: string) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date)
}

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
        return (
            error.response?.data?.error?.message ??
            'Unable to load users. Please try again.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'Unable to load users.'
}

export default function AdminUsersPage() {
    const request = useAuthenticatedRequest()

    const [requestState, setRequestState] =
        useState<UsersRequestState | null>(null)

    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')

    const [page, setPage] = useState(1)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    const params = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            ...(search ? { search } : {}),
            ...(roleFilter !== 'ALL' ? { role: roleFilter } : {}),
        }),
        [page, search, roleFilter],
    )

    const queryKey = JSON.stringify({
        ...params,
        refreshKey,
    })

    const currentResult =
        requestState?.key === queryKey ? requestState : null

    const users = currentResult?.users ?? []
    const total = currentResult?.total ?? 0
    const totalPages = currentResult?.totalPages ?? 0
    const error = currentResult?.error ?? null
    const isLoading = currentResult === null

    const hasFilters =
        searchInput.trim().length > 0 || roleFilter !== 'ALL'

    const holdersOnPage = users.filter(
        (user) => user.role === 'HOLDER',
    ).length

    const organizationAdminsOnPage = users.filter(
        (user) =>
            user.role === 'ISSUER_ADMIN' ||
            user.role === 'VERIFIER_ADMIN',
    ).length

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, 350)

        return () => window.clearTimeout(timeout)
    }, [searchInput])

    useEffect(() => {
        const controller = new AbortController()

        getAdminUsers(request, params, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: queryKey,
                    users: response.data,
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
                    users: [],
                    total: 0,
                    totalPages: 0,
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, params, queryKey])

    function clearFilters() {
        setSearchInput('')
        setSearch('')
        setRoleFilter('ALL')
        setPage(1)
        setExpandedId(null)
    }

    function refreshUsers() {
        setExpandedId(null)
        setRefreshKey((value) => value + 1)
    }

    function changePage(nextPage: number) {
        setExpandedId(null)
        setPage(nextPage)
    }

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#6D28D9] uppercase">
                        <ShieldCheck className="size-4" />
                        System Administration
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        User Management
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        View registered accounts, monitor user roles,
                        and inspect organization memberships and activity.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={refreshUsers}
                    disabled={isLoading}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500">
                            Registered Users
                        </p>

                        <Users className="size-5 text-violet-600" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {total.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        Matching the current filters
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500">
                            Credential Holders
                        </p>

                        <UserRound className="size-5 text-violet-600" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {holdersOnPage.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        On the current page
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500">
                            Organization Administrators
                        </p>

                        <ShieldCheck className="size-5 text-violet-600" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {organizationAdminsOnPage.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        University and bank admins on this page
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                Registered Users
                            </h2>

                            <p className="mt-1 text-sm text-slate-500">
                                Search by name or email and filter by role.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative sm:w-64">
                                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />

                                <input
                                    type="search"
                                    value={searchInput}
                                    maxLength={100}
                                    onChange={(event) => {
                                        setSearchInput(event.target.value)
                                        setExpandedId(null)
                                    }}
                                    placeholder="Search name or email..."
                                    aria-label="Search users"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                                />
                            </div>

                            <select
                                value={roleFilter}
                                onChange={(event) => {
                                    setRoleFilter(
                                        event.target.value as RoleFilter,
                                    )
                                    setPage(1)
                                    setExpandedId(null)
                                }}
                                aria-label="Filter by user role"
                                className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                            >
                                <option value="ALL">All roles</option>
                                <option value="SYSTEM_ADMIN">
                                    System Administrator
                                </option>
                                <option value="ISSUER_ADMIN">
                                    University Administrator
                                </option>
                                <option value="VERIFIER_ADMIN">
                                    Bank Administrator
                                </option>
                                <option value="HOLDER">
                                    Credential Holder
                                </option>
                            </select>
                        </div>
                    </div>

                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-3 cursor-pointer text-xs font-medium text-violet-700 hover:text-violet-900"
                        >
                            Clear all filters
                        </button>
                    )}
                </div>

                {error && (
                    <div
                        role="alert"
                        className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
                    >
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />

                            <div>
                                <p className="text-sm font-semibold text-red-800">
                                    Unable to load users
                                </p>

                                <p className="mt-1 text-sm text-red-700">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={refreshUsers}
                            className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50">
                            <tr>
                                {[
                                    'User',
                                    'Role',
                                    'Organizations',
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
                                        colSpan={6}
                                        className="px-5 py-16 text-center"
                                    >
                                        <RefreshCw className="mx-auto size-6 animate-spin text-violet-600" />

                                        <p className="mt-3 text-sm text-slate-500">
                                            Loading users...
                                        </p>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-12 text-center text-sm text-slate-500"
                                    >
                                        User data could not be loaded.
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center"
                                    >
                                        <Users className="mx-auto size-8 text-slate-300" />

                                        <p className="mt-3 text-sm font-medium text-slate-700">
                                            No users found
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            {hasFilters
                                                ? 'Try changing your search or role filter.'
                                                : 'No users have been registered yet.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <Fragment key={user.id}>
                                        <tr className="transition-colors hover:bg-slate-50/70">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                                        <UserRound className="size-5 text-violet-700" />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-slate-900">
                                                            {user.name}
                                                        </p>

                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${roleStyles[user.role]}`}
                                                >
                                                    {roleLabels[user.role]}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-700">
                                                {user._count.organizationMemberships}
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-700">
                                                {user._count.credentials}
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                                {formatDate(user.createdAt)}
                                            </td>

                                            <td className="px-5 py-4">
                                                <button
                                                    type="button"
                                                    aria-expanded={expandedId === user.id}
                                                    onClick={() =>
                                                        setExpandedId(
                                                            expandedId === user.id
                                                                ? null
                                                                : user.id,
                                                        )
                                                    }
                                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                                                >
                                                    <Eye className="size-3.5" />
                                                    {expandedId === user.id
                                                        ? 'Close'
                                                        : 'View'}
                                                </button>
                                            </td>
                                        </tr>

                                        {expandedId === user.id && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-5 py-4"
                                                >
                                                    <AdminUserDetailsPanel
                                                        userId={user.id}
                                                        request={request}
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
                            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} users`}
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
                            disabled={
                                totalPages === 0 ||
                                page >= totalPages ||
                                isLoading
                            }
                            aria-label="Next page"
                            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-700" />

                <p className="text-xs leading-5 text-slate-600">
                    User accounts are displayed in read-only mode.
                    Account editing and role changes are not available.
                </p>
            </div>
        </section>
    )
}