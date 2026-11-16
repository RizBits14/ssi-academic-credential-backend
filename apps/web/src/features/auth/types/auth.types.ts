
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

export interface AuthSessionResponse {
    accessToken: string
    user: AuthUser
}

export type LoginResponse = AuthSessionResponse

export type RefreshTokenResponse = AuthSessionResponse

export interface CurrentUserResponse {
    sub: string
    email: string
    role: UserRole
}
