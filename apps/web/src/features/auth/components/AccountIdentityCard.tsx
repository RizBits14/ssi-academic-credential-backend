
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import { useAuth } from '@/features/hooks/useAuth'
import { useAuthenticatedRequest } from '@/features/auth/hooks/useAuthenticatedRequest'
import type { CurrentUserResponse } from '@/features/auth/types/auth.types'

export default function AccountIdentityCard() {
    const { user } = useAuth()
    const request = useAuthenticatedRequest()

    const [identity, setIdentity] =
        useState<CurrentUserResponse | null>(null)

    const [error, setError] = useState(false)

    useEffect(() => {
        let active = true

        request<CurrentUserResponse>({
            method: 'GET',
            url: '/auth/me',
        })
            .then((data) => {
                if (active) {
                    setIdentity(data)
                    setError(false)
                }
            })
            .catch(() => {
                if (active) {
                    setError(true)
                }
            })

        return () => {
            active = false
        }
    }, [request])

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <ShieldCheck className="size-5 text-slate-700" />
                </div>

                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-slate-900">
                        Authenticated Account
                    </h2>

                    <p className="mt-1 text-sm text-slate-600">
                        {user?.name ?? 'Unknown user'}
                    </p>

                    {identity ? (
                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p className="break-all">{identity.email}</p>
                            <p>Role: {identity.role}</p>
                            <p className="font-medium text-green-700">
                                Session verified with server
                            </p>
                        </div>
                    ) : error ? (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                            Unable to verify the session with the server.
                        </p>
                    ) : (
                        <p role="status" className="mt-3 text-sm text-slate-500">
                            Verifying your session...
                        </p>
                    )}
                </div>
            </div>
        </section>
    )
}
