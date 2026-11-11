
import { Link, Route, Routes } from 'react-router'
import App from '../App'

type PlaceholderPageProps = {
    title: string
}

function PlaceholderPage({ title }: PlaceholderPageProps) {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h1 className="text-2xl font-semibold text-slate-900">
                    {title}
                </h1>

                <p className="mt-3 text-sm text-slate-500">
                    This page will be implemented in an upcoming checkpoint.
                </p>

                <Link
                    to="/"
                    className="mt-6 inline-block text-sm font-medium text-slate-700 underline underline-offset-4"
                >
                    Back to Home
                </Link>
            </div>
        </main>
    )
}

export default function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<App />} />

            <Route
                path="/login"
                element={<PlaceholderPage title="Login" />}
            />

            <Route
                path="/admin/dashboard"
                element={<PlaceholderPage title="System Administrator Dashboard" />}
            />

            <Route
                path="/university/dashboard"
                element={<PlaceholderPage title="University Dashboard" />}
            />

            <Route
                path="/bank/dashboard"
                element={<PlaceholderPage title="Bank Dashboard" />}
            />

            <Route
                path="/holder/dashboard"
                element={<PlaceholderPage title="Credential Holder Dashboard" />}
            />

            <Route
                path="*"
                element={<PlaceholderPage title="404 — Page Not Found" />}
            />
        </Routes>
    )
}
