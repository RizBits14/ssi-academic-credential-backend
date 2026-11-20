import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import {
    Activity,
    AlertCircle,
    Building2,
    RefreshCw,
} from 'lucide-react'

import type { AuthenticatedRequest } from '@/features/admin/services/admin.service'
import { getAdminUserDetails } from '@/features/admin/services/users.service'
import type { AdminUserDetails } from '@/features/admin/types/users.types'

interface Props {
    userId: string
    request: AuthenticatedRequest
}

interface DetailsRequestState {
    key: number
    data: AdminUserDetails | null
    error: string | null
}

function formatDate(value: string) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

function formatAction(action: string) {
    return action
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
        return (
            error.response?.data?.error?.message ??
            'Unable to load user details.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'Unable to load user details.'
}

export default function AdminUserDetailsPanel({
    userId,
    request,
}: Props) {
    const [refreshKey, setRefreshKey] = useState(0)

    const [requestState, setRequestState] =
        useState<DetailsRequestState | null>(null)

    const currentResult =
        requestState?.key === refreshKey ? requestState : null

    const user = currentResult?.data ?? null
    const error = currentResult?.error ?? null
    const isLoading = currentResult === null

    useEffect(() => {
        const controller = new AbortController()

        getAdminUserDetails(request, userId, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: refreshKey,
                    data: response,
                    error: null,
                })
            })
            .catch((requestError: unknown) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: refreshKey,
                    data: null,
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, userId, refreshKey])

    if (isLoading) {
        return (
            <div
                role="status"
                className="flex items-center gap-3 rounded-lg bg-slate-50 p-5 text-sm text-slate-500"
            >
                <RefreshCw className="size-4 animate-spin text-violet-600" />
                Loading user details...
            </div>
        )
    }

    if (error) {
        return (
            <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
            >
                <div className="flex items-center gap-2 text-sm text-red-700">
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                </div>

                <button
                    type="button"
                    onClick={() => setRefreshKey((value) => value + 1)}
                    className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                    Try again
                </button>
            </div>
        )
    }

    if (!user) {
        return null
    }

    const accountStatistics = [
        {
            label: 'Academic Records',
            value: user._count.academicRecords,
        },
        {
            label: 'Issued Credentials',
            value: user._count.credentials,
        },
        {
            label: 'Wallet Credentials',
            value: user._count.walletCredentials,
        },
        {
            label: 'Applications',
            value: user._count.applications,
        },
        {
            label: 'Verification Requests Created',
            value: user._count.verificationRequestsCreated,
        },
        {
            label: 'Verification Requests Received',
            value: user._count.verificationRequestsReceived,
        },
        {
            label: 'Presentations',
            value: user._count.presentations,
        },
        {
            label: 'Organization Memberships',
            value: user._count.organizationMemberships,
        },
    ]

    return (
        <div className="space-y-5 rounded-xl bg-slate-50 p-4 sm:p-5">
            <div>
                <h3 className="text-sm font-semibold text-slate-900">
                    Account Information
                </h3>

                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <p className="text-xs text-slate-500">
                            User ID
                        </p>
                        <p className="mt-1 break-all text-xs font-medium text-slate-800">
                            {user.id}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-slate-500">
                            Email
                        </p>
                        <p className="mt-1 break-all text-sm font-medium text-slate-800">
                            {user.email}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-slate-500">
                            Registered
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                            {formatDate(user.createdAt)}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-slate-500">
                            Last Updated
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                            {formatDate(user.updatedAt)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">
                    Account Statistics
                </h3>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {accountStatistics.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                            <p className="text-xs text-slate-500">
                                {stat.label}
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-900">
                                {stat.value.toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-violet-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                        Organization Memberships
                    </h3>
                </div>

                {user.organizationMemberships.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                        This user has no organization memberships.
                    </p>
                ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {user.organizationMemberships.map((membership) => (
                            <div
                                key={membership.id}
                                className="rounded-lg border border-slate-200 bg-white p-4"
                            >
                                <p className="text-sm font-semibold text-slate-900">
                                    {membership.organization.name}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                    {membership.organization.slug}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                                        {membership.organization.type}
                                    </span>

                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                        {membership.organization.status}
                                    </span>
                                </div>

                                <p className="mt-3 text-xs text-slate-500">
                                    Joined {formatDate(membership.createdAt)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center gap-2">
                    <Activity className="size-4 text-violet-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                        Recent Activity
                    </h3>
                </div>

                {user.recentActivities.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                        No recent activities found for this user.
                    </p>
                ) : (
                    <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
                        {user.recentActivities.map((activity) => (
                            <div
                                key={activity.id}
                                className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                            >
                                <div>
                                    <p className="text-sm font-medium text-slate-800">
                                        {formatAction(activity.action)}
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                        {activity.resourceType ?? 'Platform Event'}
                                    </p>
                                </div>

                                <time
                                    dateTime={activity.createdAt}
                                    className="text-xs text-slate-500"
                                >
                                    {formatDate(activity.createdAt)}
                                </time>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}