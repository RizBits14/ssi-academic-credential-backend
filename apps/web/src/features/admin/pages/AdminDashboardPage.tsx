
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
    Activity,
    AlertCircle,
    ArrowRight,
    BadgeCheck,
    Building2,
    Clock3,
    FileText,
    GraduationCap,
    Landmark,
    RefreshCw,
    ShieldCheck,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { isAxiosError } from 'axios'

import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import { getAdminDashboardOverview } from '@/features/admin/services/admin.service'
import type {
    AdminDashboardOverview,
    AdminRecentActivity,
} from '@/features/admin/types/admin.types'
import type { UserRole } from '@/features/auth/types/auth.types'

interface DashboardRequestState {
    key: number
    data: AdminDashboardOverview | null
    error: string | null
}

interface StatCardProps {
    title: string
    value: number | undefined
    description: string
    icon: LucideIcon
}

interface BreakdownRow {
    label: string
    value: number
    colorClass: string
}

interface BreakdownCardProps {
    title: string
    description: string
    total: number
    rows: BreakdownRow[]
}

const roleLabels: Record<UserRole, string> = {
    SYSTEM_ADMIN: 'System Administrator',
    ISSUER_ADMIN: 'University Administrator',
    VERIFIER_ADMIN: 'Bank Administrator',
    HOLDER: 'Credential Holder',
}

function formatAction(action: string) {
    return action
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

function formatDateTime(value: string) {
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
            'Unable to load dashboard information. Please try again.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'Unable to load dashboard information.'
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
}: StatCardProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-500">
                    {title}
                </p>

                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                    <Icon className="size-5 text-[#6D28D9]" />
                </div>
            </div>

            <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                {value === undefined ? '—' : value.toLocaleString()}
            </p>

            <p className="mt-1 text-xs text-slate-500">
                {description}
            </p>
        </div>
    )
}

function BreakdownCard({
    title,
    description,
    total,
    rows,
}: BreakdownCardProps) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-900">
                        {title}
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                        {description}
                    </p>
                </div>

                <span className="shrink-0 rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
                    {total.toLocaleString()}
                </span>
            </div>

            <div className="space-y-5">
                {rows.map((row) => {
                    const percentage =
                        total > 0
                            ? Math.round((row.value / total) * 100)
                            : 0

                    return (
                        <div key={row.label}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-sm text-slate-600">
                                    {row.label}
                                </span>

                                <span className="text-sm font-semibold text-slate-900">
                                    {row.value.toLocaleString()}
                                </span>
                            </div>

                            <div
                                className="h-2 overflow-hidden rounded-full bg-slate-100"
                                role="img"
                                aria-label={`${row.label}: ${percentage}%`}
                            >
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${row.colorClass}`}
                                    style={{
                                        width: `${percentage}%`,
                                    }}
                                />
                            </div>

                            <p className="mt-1 text-right text-[11px] text-slate-400">
                                {percentage}%
                            </p>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function RecentActivityItem({
    activity,
}: {
    activity: AdminRecentActivity
}) {
    const actorName = activity.actor?.name ?? 'System'
    const actorRole = activity.actor
        ? roleLabels[activity.actor.role]
        : 'System activity'

    return (
        <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                    <Activity className="size-4 text-[#6D28D9]" />
                </div>

                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                        {formatAction(activity.action)}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        {actorName}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {actorRole}
                    </p>

                    {(activity.resourceType || activity.organization) && (
                        <p className="mt-1 truncate text-xs text-slate-400">
                            {[
                                activity.resourceType,
                                activity.organization?.name,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    )}
                </div>
            </div>

            <time
                dateTime={activity.createdAt}
                className="shrink-0 pl-12 text-xs text-slate-400 sm:pl-0"
            >
                {formatDateTime(activity.createdAt)}
            </time>
        </div>
    )
}

export default function AdminDashboardPage() {
    const request = useAuthenticatedRequest()

    const [refreshKey, setRefreshKey] = useState(0)

    const [requestState, setRequestState] =
        useState<DashboardRequestState>({
            key: -1,
            data: null,
            error: null,
        })

    const currentResult =
        requestState.key === refreshKey ? requestState : null

    const dashboard = requestState.data
    const isLoading = currentResult === null
    const error = currentResult?.error ?? null

    useEffect(() => {
        const controller = new AbortController()

        getAdminDashboardOverview(request, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: refreshKey,
                    data: response.data,
                    error: null,
                })
            })
            .catch((requestError: unknown) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState((current) => ({
                    key: refreshKey,
                    data: current.data,
                    error: getErrorMessage(requestError),
                }))
            })

        return () => controller.abort()
    }, [request, refreshKey])

    function handleRefresh() {
        setRefreshKey((current) => current + 1)
    }

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <ShieldCheck className="size-4 text-[#6D28D9]" />

                        <span className="text-xs font-semibold tracking-wider text-[#6D28D9] uppercase">
                            System Administration
                        </span>
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Dashboard Overview
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        Monitor organizations, users, academic records,
                        credentials and platform activities.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                    />

                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />

                        <div>
                            <p className="text-sm font-medium text-red-800">
                                Unable to load dashboard information
                            </p>

                            <p className="mt-1 text-xs text-red-700">
                                {error}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="h-9 shrink-0 cursor-pointer rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                    >
                        Try again
                    </button>
                </div>
            )}

            {isLoading && !dashboard && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                    <RefreshCw className="size-4 animate-spin text-[#6D28D9]" />
                    Loading dashboard information...
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total Organizations"
                    value={dashboard?.organizations.total}
                    description="Universities and banks registered"
                    icon={Building2}
                />

                <StatCard
                    title="Registered Users"
                    value={dashboard?.users.total}
                    description="Across all platform roles"
                    icon={Users}
                />

                <StatCard
                    title="Academic Records"
                    value={dashboard?.academicRecords.total}
                    description="Academic records in the platform"
                    icon={GraduationCap}
                />

                <StatCard
                    title="Issued Credentials"
                    value={dashboard?.credentials.total}
                    description="Verifiable credentials issued"
                    icon={FileText}
                />
            </div>

            {dashboard && (
                <>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <BreakdownCard
                            title="Organizations"
                            description="Distribution by organization type"
                            total={dashboard.organizations.total}
                            rows={[
                                {
                                    label: 'Universities',
                                    value: dashboard.organizations.byType.university,
                                    colorClass: 'bg-violet-600',
                                },
                                {
                                    label: 'Banks',
                                    value: dashboard.organizations.byType.bank,
                                    colorClass: 'bg-blue-500',
                                },
                            ]}
                        />

                        <BreakdownCard
                            title="User Accounts"
                            description="Distribution across user roles"
                            total={dashboard.users.total}
                            rows={[
                                {
                                    label: 'System Administrators',
                                    value: dashboard.users.byRole.systemAdmin,
                                    colorClass: 'bg-violet-600',
                                },
                                {
                                    label: 'University Administrators',
                                    value: dashboard.users.byRole.issuerAdmin,
                                    colorClass: 'bg-blue-500',
                                },
                                {
                                    label: 'Bank Administrators',
                                    value: dashboard.users.byRole.verifierAdmin,
                                    colorClass: 'bg-teal-500',
                                },
                                {
                                    label: 'Credential Holders',
                                    value: dashboard.users.byRole.holder,
                                    colorClass: 'bg-emerald-500',
                                },
                            ]}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <BreakdownCard
                            title="Academic Records"
                            description="Distribution by academic record status"
                            total={dashboard.academicRecords.total}
                            rows={[
                                {
                                    label: 'Active',
                                    value: dashboard.academicRecords.byStatus.active,
                                    colorClass: 'bg-emerald-500',
                                },
                                {
                                    label: 'Graduated',
                                    value: dashboard.academicRecords.byStatus.graduated,
                                    colorClass: 'bg-blue-500',
                                },
                                {
                                    label: 'Withdrawn',
                                    value: dashboard.academicRecords.byStatus.withdrawn,
                                    colorClass: 'bg-amber-500',
                                },
                                {
                                    label: 'Invalid',
                                    value: dashboard.academicRecords.byStatus.invalid,
                                    colorClass: 'bg-red-500',
                                },
                            ]}
                        />

                        <BreakdownCard
                            title="Credential Status"
                            description="Distribution of issued credentials"
                            total={dashboard.credentials.total}
                            rows={[
                                {
                                    label: 'Active',
                                    value: dashboard.credentials.byStatus.active,
                                    colorClass: 'bg-emerald-500',
                                },
                                {
                                    label: 'Suspended',
                                    value: dashboard.credentials.byStatus.suspended,
                                    colorClass: 'bg-amber-500',
                                },
                                {
                                    label: 'Revoked',
                                    value: dashboard.credentials.byStatus.revoked,
                                    colorClass: 'bg-red-500',
                                },
                                {
                                    label: 'Expired',
                                    value: dashboard.credentials.byStatus.expired,
                                    colorClass: 'bg-slate-500',
                                },
                            ]}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
                        <div className="space-y-5">
                            <BreakdownCard
                                title="Trusted Issuers"
                                description="Issuer trust registry status"
                                total={dashboard.trustedIssuers.total}
                                rows={[
                                    {
                                        label: 'Trusted',
                                        value: dashboard.trustedIssuers.byStatus.trusted,
                                        colorClass: 'bg-emerald-500',
                                    },
                                    {
                                        label: 'Suspended',
                                        value: dashboard.trustedIssuers.byStatus.suspended,
                                        colorClass: 'bg-amber-500',
                                    },
                                    {
                                        label: 'Revoked',
                                        value: dashboard.trustedIssuers.byStatus.revoked,
                                        colorClass: 'bg-red-500',
                                    },
                                ]}
                            />

                            <section className="rounded-xl border border-violet-100 bg-violet-50/60 p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white">
                                        <Landmark className="size-4 text-[#6D28D9]" />
                                    </div>

                                    <div>
                                        <h2 className="text-sm font-semibold text-slate-900">
                                            Organization Management
                                        </h2>

                                        <p className="mt-1 text-xs leading-5 text-slate-600">
                                            View and monitor registered
                                            universities and banks.
                                        </p>

                                        <Link
                                            to="/admin/organizations"
                                            className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#6D28D9] hover:text-violet-800"
                                        >
                                            Manage organizations
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">
                                        Recent Platform Activities
                                    </h2>

                                    <p className="mt-1 text-xs text-slate-500">
                                        Latest recorded platform events
                                    </p>
                                </div>

                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                    <Clock3 className="size-4 text-[#6D28D9]" />
                                </div>
                            </div>

                            {dashboard.recentActivities.length > 0 ? (
                                <div>
                                    {dashboard.recentActivities.map(
                                        (activity) => (
                                            <RecentActivityItem
                                                key={activity.id}
                                                activity={activity}
                                            />
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100">
                                        <Activity className="size-5 text-slate-400" />
                                    </div>

                                    <p className="text-sm font-medium text-slate-700">
                                        No recent activities
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                        Platform activities will appear here.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 p-4">
                        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#6D28D9]" />

                        <p className="text-xs leading-5 text-slate-600">
                            Dashboard statistics are retrieved directly
                            from the platform database. Recent activities
                            are displayed from the audit log.
                        </p>
                    </div>
                </>
            )}
        </section>
    )
}
