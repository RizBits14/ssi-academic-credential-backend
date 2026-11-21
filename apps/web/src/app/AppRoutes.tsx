
import { Link, Route, Routes } from 'react-router'
import HomePage from '@/pages/public/HomePage'
import PublicLayout from '@/layouts/PublicLayout'
import DashboardLayout from '@/layouts/DashboardLayout'
import RequireRole from '@/features/auth/components/RequireRole'
import LoginPage from '@/pages/public/LoginPage'
import AdminOrganizationsPage from '@/features/admin/pages/AdminOrganizationsPage'
import AdminDashboardPage from '@/features/admin/pages/AdminDashboardPage'
import AdminUsersPage from '@/features/admin/pages/AdminUsersPage'
import AdminTrustRegistryPage from '@/features/admin/pages/AdminTrustRegistryPage'
import AdminAuditLogsPage from '@/features/admin/pages/AdminAuditLogsPage'

type PlaceholderPageProps = {
    title: string
    dashboard?: boolean
}

function PlaceholderPage({
    title,
    dashboard = false,
}: PlaceholderPageProps) {
    const content = (
        <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-slate-900">
                {title}
            </h1>

            <p className="mt-3 text-sm text-slate-500">
                This page will be implemented in an upcoming checkpoint.
            </p>

            {!dashboard && (
                <Link
                    to="/"
                    className="mt-6 inline-block text-sm font-medium text-slate-700 underline underline-offset-4"
                >
                    Back to Home
                </Link>
            )}
        </div>
    )

    if (dashboard) {
        return <div className="max-w-3xl">{content}</div>
    }

    return (
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-8">
            <div className="w-full max-w-md">{content}</div>
        </main>
    )
}

export default function AppRoutes() {
    return (
        <Routes>
            <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
            </Route>

            <Route element={<RequireRole role="SYSTEM_ADMIN" />}>
                <Route
                    path="/admin"
                    element={<DashboardLayout role="system" />}
                >
                    <Route
                        path="dashboard"
                        element={<AdminDashboardPage />}
                    />

                    <Route
                        path="organizations"
                        element={<AdminOrganizationsPage />}
                    />

                    <Route
                        path="users"
                        element={<AdminUsersPage />}
                    />

                    <Route
                        path="trust-registry"
                        element={<AdminTrustRegistryPage />}
                    />

                    <Route
                        path="audit-logs"
                        element={<AdminAuditLogsPage />}
                    />
                </Route>
            </Route>

            <Route element={<RequireRole role="ISSUER_ADMIN" />}>
                <Route
                    path="/university"
                    element={<DashboardLayout role="university" />}
                >
                    <Route
                        path="dashboard"
                        element={
                            <PlaceholderPage
                                title="University Dashboard"
                                dashboard
                            />
                        }
                    />
                </Route>
            </Route>

            <Route element={<RequireRole role="VERIFIER_ADMIN" />}>
                <Route
                    path="/bank"
                    element={<DashboardLayout role="bank" />}
                >
                    <Route
                        path="dashboard"
                        element={
                            <PlaceholderPage
                                title="Bank Dashboard"
                                dashboard
                            />
                        }
                    />
                </Route>
            </Route>

            <Route element={<RequireRole role="HOLDER" />}>
                <Route
                    path="/holder"
                    element={<DashboardLayout role="holder" />}
                >
                    <Route
                        path="dashboard"
                        element={
                            <PlaceholderPage
                                title="Credential Holder Dashboard"
                                dashboard
                            />
                        }
                    />
                </Route>
            </Route>

            <Route
                path="*"
                element={<PlaceholderPage title="404 — Page Not Found" />}
            />
        </Routes>
    )
}
