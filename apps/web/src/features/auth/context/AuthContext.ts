
import { createContext } from 'react'

import type {
    AuthUser,
    LoginRequest,
} from '../types/auth.types'

export interface AuthContextValue {
    user: AuthUser | null
    isAuthenticated: boolean
    isLoading: boolean
    login: (credentials: LoginRequest) => Promise<AuthUser>
    logout: () => Promise<void>
    getAccessToken: (forceRefresh?: boolean) => Promise<string | null>
    invalidateSession: (expectedAccessToken: string) => void
}

export const AuthContext = createContext<AuthContextValue | null>(
    null,
)
