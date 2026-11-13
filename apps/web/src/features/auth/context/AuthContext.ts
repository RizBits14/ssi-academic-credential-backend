
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
    getAccessToken: () => Promise<string | null>
}

export const AuthContext = createContext<AuthContextValue | null>(
    null,
)
