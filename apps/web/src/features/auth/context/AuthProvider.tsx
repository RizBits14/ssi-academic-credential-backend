
import {
    useCallback,
    useMemo,
    useRef,
    useState,
} from 'react'

import type { ReactNode } from 'react'

import { authService } from '../services/auth.service'

import type {
    AuthTokens,
    AuthUser,
    LoginRequest,
} from '../types/auth.types'

import { AuthContext } from './AuthContext'

const REFRESH_BUFFER_MS = 30_000

type AuthProviderProps = {
    children: ReactNode
}

function isTokenExpiringSoon(token: string): boolean {
    try {
        const encodedPayload = token.split('.')[1]

        if (!encodedPayload) {
            return true
        }

        const normalizedPayload = encodedPayload
            .replace(/-/g, '+')
            .replace(/_/g, '/')

        const payload = JSON.parse(
            atob(normalizedPayload),
        ) as { exp?: number }

        if (typeof payload.exp !== 'number') {
            return true
        }

        return (
            payload.exp * 1000 <=
            Date.now() + REFRESH_BUFFER_MS
        )
    } catch {
        return true
    }
}

export default function AuthProvider({
    children,
}: AuthProviderProps) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const tokensRef = useRef<AuthTokens | null>(null)

    const refreshInFlightRef = useRef<
        Promise<string | null> | null
    >(null)

    const sessionVersionRef = useRef(0)

    const login = useCallback(
        async (credentials: LoginRequest): Promise<AuthUser> => {
            setIsLoading(true)

            try {
                const response = await authService.login(credentials)

                sessionVersionRef.current += 1

                tokensRef.current = {
                    accessToken: response.accessToken,
                    refreshToken: response.refreshToken,
                }

                setUser(response.user)

                return response.user
            } finally {
                setIsLoading(false)
            }
        },
        [],
    )

    const getAccessToken = useCallback(
        async (): Promise<string | null> => {
            const currentTokens = tokensRef.current

            if (!currentTokens) {
                return null
            }

            if (!isTokenExpiringSoon(currentTokens.accessToken)) {
                return currentTokens.accessToken
            }

            if (refreshInFlightRef.current) {
                return refreshInFlightRef.current
            }

            const sessionVersion = sessionVersionRef.current

            const refreshPromise = authService
                .refresh(currentTokens.refreshToken)
                .then((newTokens) => {
                    if (sessionVersionRef.current !== sessionVersion) {
                        return null
                    }

                    tokensRef.current = newTokens

                    return newTokens.accessToken
                })
                .catch(() => {
                    if (sessionVersionRef.current === sessionVersion) {
                        tokensRef.current = null
                        setUser(null)
                    }

                    return null
                })

            refreshInFlightRef.current = refreshPromise

            void refreshPromise.finally(() => {
                if (refreshInFlightRef.current === refreshPromise) {
                    refreshInFlightRef.current = null
                }
            })

            return refreshPromise
        },
        [],
    )

    const logout = useCallback(async (): Promise<void> => {
        const accessToken = await getAccessToken()
        const currentTokens = tokensRef.current

        sessionVersionRef.current += 1

        tokensRef.current = null
        setUser(null)

        if (accessToken && currentTokens) {
            await authService.logout(
                accessToken,
                currentTokens.refreshToken,
            )
        }
    }, [getAccessToken])

    const contextValue = useMemo(
        () => ({
            user,
            isAuthenticated: user !== null,
            isLoading,
            login,
            logout,
            getAccessToken,
        }),
        [user, isLoading, login, logout, getAccessToken],
    )

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    )
}
