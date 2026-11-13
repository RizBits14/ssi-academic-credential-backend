
export type UserRole =
    | 'SYSTEM_ADMIN'
    | 'ISSUER_ADMIN'
    | 'VERIFIER_ADMIN'
    | 'HOLDER'

export interface AuthUser {
    id: string
    name: string
    email: string
    role: UserRole
}

export interface LoginRequest {
    email: string
    password: string
}

export interface AuthTokens {
    accessToken: string
    refreshToken: string
}

export interface LoginResponse extends AuthTokens {
    user: AuthUser
}

export interface RefreshTokenRequest {
    refreshToken: string
}

export type RefreshTokenResponse = AuthTokens

export interface CurrentUserResponse {
    sub: string
    email: string
    role: UserRole
}
