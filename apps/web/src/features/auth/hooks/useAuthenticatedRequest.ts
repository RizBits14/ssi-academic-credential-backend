
import { useCallback } from 'react'
import { isAxiosError } from 'axios'
import type { AxiosRequestConfig } from 'axios'

import api from '@/lib/api'
import { useAuth } from '@/features/hooks/useAuth'

export interface ApiEnvelope<T> {
    success: boolean
    data: T
    meta?: {
        timestamp: string
        page?: number
        limit?: number
        total?: number
        totalPages?: number
    }
}

export interface AuthenticatedRequestOptions {
    responseMode?: 'data' | 'envelope'
}

export function useAuthenticatedRequest() {
    const { getAccessToken, invalidateSession } = useAuth()

    return useCallback(
        async <T>(
            config: AxiosRequestConfig,
            options: AuthenticatedRequestOptions = {},
        ): Promise<T> => {
            const accessToken = await getAccessToken()

            if (!accessToken) {
                throw new Error('Authentication required')
            }

            const executeRequest = async (token: string): Promise<T> => {
                const response = await api.request<ApiEnvelope<unknown>>({
                    ...config,
                    headers: {
                        ...config.headers,
                        Authorization: `Bearer ${token}`,
                    },
                })

                return (
                    options.responseMode === 'envelope'
                        ? response.data
                        : response.data.data
                ) as T
            }

            try {
                return await executeRequest(accessToken)
            } catch (error) {
                if (
                    !isAxiosError(error) ||
                    error.response?.status !== 401
                ) {
                    throw error
                }

                const currentToken = await getAccessToken()

                const nextToken =
                    currentToken && currentToken !== accessToken
                        ? currentToken
                        : await getAccessToken(true)

                if (!nextToken) {
                    throw new Error('Authentication session expired', {
                        cause: error,
                    })
                }

                try {
                    return await executeRequest(nextToken)
                } catch (retryError) {
                    if (
                        isAxiosError(retryError) &&
                        retryError.response?.status === 401
                    ) {
                        invalidateSession(nextToken)

                        throw new Error('Authentication session expired', {
                            cause: retryError,
                        })
                    }

                    throw retryError
                }
            }
        },
        [getAccessToken, invalidateSession],
    )
}
