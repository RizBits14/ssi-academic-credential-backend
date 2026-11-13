
import {
    Navigate,
    Outlet,
    useLocation,
} from 'react-router'

// import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types/auth.types'
import { useAuth } from '@/features/hooks/useAuth'

interface RequireRoleProps {
    role: UserRole
}

const dashboardRoutes: Record<UserRole, string> = {
    SYSTEM_ADMIN: '/admin/dashboard',
    ISSUER_ADMIN: '/university/dashboard',
    VERIFIER_ADMIN: '/bank/dashboard',
    HOLDER: '/holder/dashboard',
}

export default function RequireRole({
    role,
}: RequireRoleProps) {
    const { user, isLoading } = useAuth()
    const location = useLocation()

    if (isLoading) {
        return (
            <main
                role="status"
                className="flex min-h-screen items-center justify-center bg-slate-50 px-4"
            >
                <p className="text-sm text-slate-600">
                    Checking access...
                </p>
            </main>
        )
    }

    if (!user) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
            />
        )
    }

    if (user.role !== role) {
        return (
            <Navigate
                to={dashboardRoutes[user.role]}
                replace
            />
        )
    }

    return <Outlet />
}
