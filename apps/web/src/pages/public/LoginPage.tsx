
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Navigate, useNavigate } from 'react-router'
import { LockKeyhole, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/hooks/useAuth'
import type { UserRole } from '@/features/auth/types/auth.types'

const dashboardRoutes: Record<UserRole, string> = {
    SYSTEM_ADMIN: '/admin/dashboard',
    ISSUER_ADMIN: '/university/dashboard',
    VERIFIER_ADMIN: '/bank/dashboard',
    HOLDER: '/holder/dashboard',
}

export default function LoginPage() {
    const navigate = useNavigate()
    const { user, login } = useAuth()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (isSubmitting) {
            return
        }

        setIsSubmitting(true)
        setErrorMessage(null)

        try {
            const authenticatedUser = await login({
                email: email.trim(),
                password,
            })

            navigate(dashboardRoutes[authenticatedUser.role], {
                replace: true,
            })
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 401) {
                setErrorMessage('Invalid email or password.')
            } else {
                setErrorMessage(
                    'Unable to sign in. Please try again later.',
                )
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    if (user) {
        return (
            <Navigate
                to={dashboardRoutes[user.role]}
                replace
            />
        )
    }

    return (
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-12 sm:px-6">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        <ShieldCheck className="size-7" />
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Welcome back
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Sign in to manage and verify academic credentials.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900">
                            Sign in to your account
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Enter your registered credentials to continue.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Email address
                            </label>

                            <input
                                id="email"
                                type="email"
                                name="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus-visible:border-slate-600 focus-visible:ring-2 focus-visible:ring-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Password
                            </label>

                            <input
                                id="password"
                                type="password"
                                name="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Enter your password"
                                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus-visible:border-slate-600 focus-visible:ring-2 focus-visible:ring-slate-200"
                            />
                        </div>

                        {errorMessage && (
                            <div
                                role="alert"
                                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                                {errorMessage}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="h-11 w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>

                    <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-500">
                        <LockKeyhole className="size-4" />
                        Secure academic credential platform
                    </div>
                </div>
            </div>
        </main>
    )
}
