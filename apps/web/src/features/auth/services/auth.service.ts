
import api from '@/lib/api'

import type {
    CurrentUserResponse,
    LoginRequest,
    LoginResponse,
    RefreshTokenResponse,
} from '../types/auth.types'

interface ApiResponse<T> {
    success: boolean
    data: T
    meta?: {
        timestamp: string
    }
}

export const authService = {
    async login(credentials: LoginRequest): Promise<LoginResponse> {
        const response = await api.post<ApiResponse<LoginResponse>>(
            '/auth/login',
            credentials,
        )

        return response.data.data
    },

    async refresh(refreshToken: string): Promise<RefreshTokenResponse> {
        const response = await api.post<ApiResponse<RefreshTokenResponse>>(
            '/auth/refresh',
            { refreshToken },
        )

        return response.data.data
    },

    async getCurrentUser(
        accessToken: string,
    ): Promise<CurrentUserResponse> {
        const response = await api.get<ApiResponse<CurrentUserResponse>>(
            '/auth/me',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )

        return response.data.data
    },

    async logout(
        accessToken: string,
        refreshToken: string,
    ): Promise<void> {
        await api.post(
            '/auth/logout',
            { refreshToken },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        )
    },
}
