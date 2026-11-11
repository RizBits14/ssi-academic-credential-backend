
import { Link, NavLink, Outlet } from 'react-router'
import {
    ArrowLeft,
    Building2,
    GraduationCap,
    LayoutDashboard,
    ShieldCheck,
    Wallet,
} from 'lucide-react'

type DashboardRole = 'system' | 'university' | 'bank' | 'holder'

type DashboardLayoutProps = {
    role: DashboardRole
}

const roleConfig = {
    system: {
        title: 'System Administrator',
        path: '/admin/dashboard',
        accent: 'bg-[#6D28D9]',
        icon: ShieldCheck,
    },
    university: {
        title: 'University Administrator',
        path: '/university/dashboard',
        accent: 'bg-[#1D4ED8]',
        icon: GraduationCap,
    },
    bank: {
        title: 'Bank Administrator',
        path: '/bank/dashboard',
        accent: 'bg-[#0F766E]',
        icon: Building2,
    },
    holder: {
        title: 'Credential Holder',
        path: '/holder/dashboard',
        accent: 'bg-[#15803D]',
        icon: Wallet,
    },
}

export default function DashboardLayout({
    role,
}: DashboardLayoutProps) {
    const config = roleConfig[role]
    const RoleIcon = config.icon

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div
                            className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-white ${config.accent}`}
                        >
                            <RoleIcon className="size-5" />
                        </div>

                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                                SSI Credential Platform
                            </p>
                            <p className="truncate text-xs text-slate-500">
                                {config.title}
                            </p>
                        </div>
                    </div>

                    <Link
                        to="/"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100"
                    >
                        <ArrowLeft className="size-4" />
                        <span className="hidden sm:inline">Back to Home</span>
                        <span className="sm:hidden">Home</span>
                    </Link>
                </div>
            </header>

            <div className="mx-auto flex max-w-7xl flex-col md:min-h-[calc(100vh-4rem)] md:flex-row">
                <aside className="border-b border-slate-200 bg-white p-4 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:p-5">
                    <p className="mb-3 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                        Workspace
                    </p>

                    <nav aria-label="Dashboard navigation">
                        <NavLink
                            to={config.path}
                            end
                            className={({ isActive }) =>
                                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                    ? 'bg-slate-100 text-slate-900'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`
                            }
                        >
                            <LayoutDashboard className="size-4" />
                            Dashboard
                        </NavLink>
                    </nav>
                </aside>

                <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
