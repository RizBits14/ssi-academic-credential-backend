import {
    Fragment,
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react'
import { isAxiosError } from 'axios'
import {
    Activity,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    History,
    RefreshCw,
    Search,
    ShieldCheck,
} from 'lucide-react'

import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import { getAuditLogs } from '@/features/admin/services/audit.service'
import type { AuditLog } from '@/features/admin/types/audit.types'

const PAGE_SIZE = 20

interface AuditRequestState {
    key: string
    logs: AuditLog[]
    total: number
    totalPages: number
    error: string | null
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
            'Unable to load audit logs. Please try again.'
        )
    }

    return error instanceof Error
        ? error.message
        : 'Unable to load audit logs.'
}

function AuditLogDetails({
    log,
}: {
    log: AuditLog
}) {
    const details = [
        {
            label: 'Event ID',
            value: log.id,
        },
        {
            label: 'Actor ID',
            value: log.actorId ?? 'System',
        },
        {
            label: 'Organization ID',
            value: log.organizationId ?? 'Not associated',
        },
        {
            label: 'Resource Type',
            value: log.resourceType ?? 'Not provided',
        },
        {
            label: 'Resource ID',
            value: log.resourceId ?? 'Not provided',
        },
        {
            label: 'IP Address',
            value: log.ipAddress ?? 'Not recorded',
        },
        {
            label: 'User Agent',
            value: log.userAgent ?? 'Not recorded',
        },
        {
            label: 'Created At',
            value: formatDateTime(log.createdAt),
        },
    ]

    const metadataText =
        log.metadata === null || log.metadata === undefined
            ? null
            : JSON.stringify(log.metadata, null, 2)

    return (
        <div className="space-y-5 rounded-lg bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {details.map((detail) => (
                    <div
                        key={detail.label}
                        className="min-w-0"
                    >
                        <p className="text-xs font-medium text-slate-500">
                            {detail.label}
                        </p>

                        <p className="mt-1 break-all text-sm font-medium text-slate-800">
                            {detail.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center gap-2">
                    <FileText className="size-4 text-violet-700" />

                    <h3 className="text-sm font-semibold text-slate-900">
                        Event Metadata
                    </h3>
                </div>

                {metadataText ? (
                    <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs leading-6 break-all whitespace-pre-wrap text-slate-700">
                        {metadataText}
                    </pre>
                ) : (
                    <p className="text-sm text-slate-500">
                        No additional metadata was recorded.
                    </p>
                )}
            </div>
        </div>
    )
}

export default function AdminAuditLogsPage() {
    const request = useAuthenticatedRequest()

    const [requestState, setRequestState] =
        useState<AuditRequestState | null>(null)

    const [actionInput, setActionInput] = useState('')
    const [actionFilter, setActionFilter] = useState('')

    const [page, setPage] = useState(1)
    const [refreshKey, setRefreshKey] = useState(0)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const params = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            ...(actionFilter ? { action: actionFilter } : {}),
        }),
        [page, actionFilter],
    )

    const queryKey = JSON.stringify({
        ...params,
        refreshKey,
    })

    const currentResult =
        requestState?.key === queryKey ? requestState : null

    const logs = currentResult?.logs ?? []
    const total = currentResult?.total ?? 0
    const totalPages = currentResult?.totalPages ?? 0
    const error = currentResult?.error ?? null
    const isLoading = currentResult === null

    const distinctActions = new Set(
        logs.map((log) => log.action),
    ).size

    useEffect(() => {
        const controller = new AbortController()

        getAuditLogs(request, params, controller.signal)
            .then((response) => {
                if (controller.signal.aborted) {
                    return
                }

                setRequestState({
                    key: queryKey,
                    logs: response.data,
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
                    logs: [],
                    total: 0,
                    totalPages: 0,
                    error: getErrorMessage(requestError),
                })
            })

        return () => controller.abort()
    }, [request, params, queryKey])

    function applyActionFilter(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        setActionFilter(actionInput.trim().toUpperCase())
        setPage(1)
        setExpandedId(null)
    }

    function clearActionFilter() {
        setActionInput('')
        setActionFilter('')
        setPage(1)
        setExpandedId(null)
    }

    function refreshLogs() {
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
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-violet-700 uppercase">
                        <ShieldCheck className="size-4" />
                        System Administration
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Audit Logs
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Review recorded platform activities, investigate
                        events, and monitor administrative operations.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={refreshLogs}
                    disabled={isLoading}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                            Recorded Events
                        </p>

                        <History className="size-5 text-violet-700" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {total.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        Matching the current filter
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500">
                            Events Displayed
                        </p>

                        <Activity className="size-5 text-violet-700" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {logs.length.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        On the current page
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500">
                            Distinct Actions
                        </p>

                        <FileText className="size-5 text-violet-700" />
                    </div>

                    <p className="mt-4 text-2xl font-semibold text-slate-900">
                        {distinctActions.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                        On the current page
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between sm:p-5">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            Platform Activity History
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Browse events in reverse chronological order.
                        </p>
                    </div>

                    <form
                        onSubmit={applyActionFilter}
                        className="flex flex-col gap-2 sm:flex-row"
                    >
                        <div className="relative sm:w-64">
                            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />

                            <input
                                type="search"
                                value={actionInput}
                                maxLength={100}
                                onChange={(event) =>
                                    setActionInput(event.target.value)
                                }
                                placeholder="Action code, e.g. LOGIN"
                                aria-label="Filter audit logs by action"
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                            />
                        </div>

                        <button
                            type="submit"
                            className="h-10 cursor-pointer rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
                        >
                            Apply Filter
                        </button>

                        {(actionFilter || actionInput) && (
                            <button
                                type="button"
                                onClick={clearActionFilter}
                                className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Clear
                            </button>
                        )}
                    </form>
                </div>

                {actionFilter && (
                    <div className="border-b border-slate-100 px-5 py-3">
                        <p className="text-xs text-slate-500">
                            Filtering by action:
                            <span className="ml-2 font-semibold text-violet-700">
                                {actionFilter}
                            </span>
                        </p>
                    </div>
                )}

                {error && (
                    <div
                        role="alert"
                        className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
                    >
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />

                            <div>
                                <p className="text-sm font-semibold text-red-800">
                                    Unable to load audit logs
                                </p>

                                <p className="mt-1 text-sm text-red-700">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={refreshLogs}
                            className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50">
                            <tr>
                                {[
                                    'Date & Time',
                                    'Action',
                                    'Actor',
                                    'Organization',
                                    'Resource',
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
                                        <RefreshCw className="mx-auto size-6 animate-spin text-violet-700" />

                                        <p className="mt-3 text-sm text-slate-500">
                                            Loading audit logs...
                                        </p>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-12 text-center text-sm text-slate-500"
                                    >
                                        Audit records could not be loaded.
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center"
                                    >
                                        <History className="mx-auto size-8 text-slate-300" />

                                        <p className="mt-3 text-sm font-medium text-slate-700">
                                            No audit logs found
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            {actionFilter
                                                ? 'No events match this action code.'
                                                : 'Platform events will appear here when recorded.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <Fragment key={log.id}>
                                        <tr className="hover:bg-slate-50/70">
                                            <td className="px-5 py-4">
                                                <time
                                                    dateTime={log.createdAt}
                                                    className="text-sm text-slate-600"
                                                >
                                                    {formatDateTime(log.createdAt)}
                                                </time>
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                                        <Activity className="size-4 text-violet-700" />
                                                    </div>

                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-800">
                                                            {formatAction(log.action)}
                                                        </p>

                                                        <p className="mt-1 text-xs text-slate-400">
                                                            {log.action}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p
                                                    title={log.actorId ?? undefined}
                                                    className="max-w-36 truncate text-xs text-slate-600"
                                                >
                                                    {log.actorId ?? 'System'}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p
                                                    title={log.organizationId ?? undefined}
                                                    className="max-w-36 truncate text-xs text-slate-600"
                                                >
                                                    {log.organizationId ?? 'Not associated'}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p className="text-sm text-slate-700">
                                                    {log.resourceType ?? 'Not provided'}
                                                </p>

                                                <p
                                                    title={log.resourceId ?? undefined}
                                                    className="mt-1 max-w-36 truncate text-xs text-slate-400"
                                                >
                                                    {log.resourceId ?? 'No resource ID'}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <button
                                                    type="button"
                                                    aria-expanded={expandedId === log.id}
                                                    onClick={() =>
                                                        setExpandedId(
                                                            expandedId === log.id
                                                                ? null
                                                                : log.id,
                                                        )
                                                    }
                                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                                                >
                                                    <Eye className="size-3.5" />
                                                    {expandedId === log.id
                                                        ? 'Close'
                                                        : 'View'}
                                                </button>
                                            </td>
                                        </tr>

                                        {expandedId === log.id && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-5 py-4"
                                                >
                                                    <AuditLogDetails log={log} />
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
                            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} audit events`}
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

            <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-700" />

                <p className="text-xs leading-5 text-slate-600">
                    Audit records are displayed in read-only mode.
                    The information shown is retrieved from the platform's
                    recorded events.
                </p>
            </div>
        </section>
    )
}