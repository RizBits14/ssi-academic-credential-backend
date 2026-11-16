
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import type { ReactNode } from 'react'
import { isAxiosError } from 'axios'

import { authService } from '../services/auth.service'

import type {
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
    const [isLoading, setIsLoading] = useState(true)

    const accessTokenRef = useRef<string | null>(null)

    const refreshInFlightRef = useRef<
        Promise<string | null> | null
    >(null)

    const initializationPromiseRef = useRef<
        Promise<string | null> | null
    >(null)

    const sessionVersionRef = useRef(0)

    const refreshAccessToken = useCallback(
        (): Promise<string | null> => {
            if (refreshInFlightRef.current) {
                return refreshInFlightRef.current
            }

            const sessionVersion = sessionVersionRef.current

            const refreshPromise: Promise<string | null> = authService
                .refresh()
                .then((response) => {
                    if (
                        sessionVersionRef.current !== sessionVersion
                    ) {
                        return null
                    }

                    accessTokenRef.current = response.accessToken
                    setUser(response.user)

                    return response.accessToken
                })
                .catch((error: unknown) => {
                    if (
                        sessionVersionRef.current === sessionVersion &&
                        isAxiosError(error) &&
                        error.response?.status === 401
                    ) {
                        sessionVersionRef.current += 1
                        accessTokenRef.current = null
                        setUser(null)

                        return null
                    }

                    throw error
                })
                .finally(() => {
                    if (
                        refreshInFlightRef.current === refreshPromise
                    ) {
                        refreshInFlightRef.current = null
                    }
                })

            refreshInFlightRef.current = refreshPromise

            return refreshPromise
        },
        [],
    )

    useEffect(() => {
        let isActive = true

        if (!initializationPromiseRef.current) {
            initializationPromiseRef.current =
                refreshAccessToken().catch(() => null)
        }

        void initializationPromiseRef.current.finally(() => {
            if (isActive) {
                setIsLoading(false)
            }
        })

        return () => {
            isActive = false
        }
    }, [refreshAccessToken])

    const login = useCallback(
        async (credentials: LoginRequest): Promise<AuthUser> => {
            setIsLoading(true)

            try {
                const response = await authService.login(credentials)

                sessionVersionRef.current += 1
                refreshInFlightRef.current = null

                accessTokenRef.current = response.accessToken

                setUser(response.user)

                return response.user
            } finally {
                setIsLoading(false)
            }
        },
        [],
    )

    const getAccessToken = useCallback(
        async (forceRefresh = false): Promise<string | null> => {
            const currentToken = accessTokenRef.current

            if (
                !forceRefresh &&
                currentToken &&
                !isTokenExpiringSoon(currentToken)
            ) {
                return currentToken
            }

            return refreshAccessToken()
        },
        [refreshAccessToken],
    )

    const logout = useCallback(async (): Promise<void> => {
        const accessToken = await getAccessToken()

        sessionVersionRef.current += 1
        refreshInFlightRef.current = null

        accessTokenRef.current = null
        setUser(null)

        if (accessToken) {
            await authService.logout(accessToken)
        }
    }, [getAccessToken])

    const invalidateSession = useCallback(
        (expectedAccessToken: string): void => {
            if (
                accessTokenRef.current !== expectedAccessToken
            ) {
                return
            }

            sessionVersionRef.current += 1
            refreshInFlightRef.current = null

            accessTokenRef.current = null
            setUser(null)
        },
        [],
    )

    const contextValue = useMemo(
        () => ({
            user,
            isAuthenticated: user !== null,
            isLoading,
            login,
            logout,
            getAccessToken,
            invalidateSession,
        }),
        [
            user,
            isLoading,
            login,
            logout,
            getAccessToken,
            invalidateSession,
        ],
    )

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    )
}
