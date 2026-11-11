
import { Link, Outlet } from 'react-router'

export default function PublicLayout() {
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                    <Link
                        to="/"
                        className="text-sm font-bold tracking-tight text-slate-900 sm:text-base"
                    >
                        SSI Credential Platform
                    </Link>

                    <Link
                        to="/login"
                        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
                    >
                        Sign In
                    </Link>
                </div>
            </header>

            <Outlet />
        </div>
    )
}
