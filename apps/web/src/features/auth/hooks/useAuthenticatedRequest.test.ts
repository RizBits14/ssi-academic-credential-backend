
import { cleanup, renderHook } from '@testing-library/react'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import api from '@/lib/api'
import { useAuth } from '@/features/hooks/useAuth'
import type { AuthUser } from '../types/auth.types'
import { useAuthenticatedRequest } from './useAuthenticatedRequest'

vi.mock('@/lib/api', () => ({
    default: {
        request: vi.fn(),
    },
}))

vi.mock('@/features/hooks/useAuth', () => ({
    useAuth: vi.fn(),
}))

const requestMock = vi.mocked(api.request)
const authMock = vi.mocked(useAuth)

const getAccessTokenMock = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_forceRefresh?: boolean): Promise<string | null> =>
        'token-a',
)

const invalidateSessionMock = vi.fn()

const testUser: AuthUser = {
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    role: 'HOLDER',
}

function apiResponse<T>(data: T): AxiosResponse {
    return {
        data: {
            success: true,
            data,
        },
    } as AxiosResponse
}

function httpError(status: number): AxiosError {
    const error = new AxiosError(`HTTP ${status}`)

    error.response = {
        status,
    } as AxiosResponse

    return error
}

beforeEach(() => {
    requestMock.mockReset()
    getAccessTokenMock.mockReset()
    invalidateSessionMock.mockReset()

    getAccessTokenMock.mockResolvedValue('token-a')

    authMock.mockReturnValue({
        user: testUser,
        isAuthenticated: true,
        isLoading: false,
        login: async () => testUser,
        logout: async () => undefined,
        getAccessToken: getAccessTokenMock,
        invalidateSession: invalidateSessionMock,
    })
})

afterEach(() => {
    cleanup()
})

describe('useAuthenticatedRequest', () => {
    it('attaches the access token and unwraps API data', async () => {
        const identity = {
            sub: 'test-user',
            email: 'test@example.com',
            role: 'HOLDER',
        }

        requestMock.mockResolvedValueOnce(apiResponse(identity))

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        const response = await result.current({
            method: 'GET',
            url: '/auth/me',
        })

        expect(response).toEqual(identity)

        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: '/auth/me',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-a',
                }),
            }),
        )
    })


    it('preserves the complete API envelope when requested', async () => {
        const envelope = {
            success: true,
            data: [
                {
                    id: 'organization-1',
                    name: 'Northbridge University',
                },
            ],
            meta: {
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1,
                timestamp: '2026-11-16T06:42:43.510Z',
            },
        }

        requestMock.mockResolvedValueOnce({
            data: envelope,
        } as AxiosResponse)

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        const response = await result.current(
            {
                method: 'GET',
                url: '/organizations',
            },
            {
                responseMode: 'envelope',
            },
        )

        expect(response).toEqual(envelope)
    })


    it('refreshes and retries once after a 401 response', async () => {
        getAccessTokenMock
            .mockResolvedValueOnce('token-a')
            .mockResolvedValueOnce('token-a')
            .mockResolvedValueOnce('token-b')

        requestMock
            .mockRejectedValueOnce(httpError(401))
            .mockResolvedValueOnce(apiResponse({ verified: true }))

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        const response = await result.current({
            method: 'GET',
            url: '/auth/me',
        })

        expect(response).toEqual({ verified: true })
        expect(requestMock).toHaveBeenCalledTimes(2)
        expect(getAccessTokenMock).toHaveBeenCalledWith(true)

        expect(requestMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-b',
                }),
            }),
        )

        expect(invalidateSessionMock).not.toHaveBeenCalled()
    })

    it('invalidates the session when retry also returns 401', async () => {
        getAccessTokenMock
            .mockResolvedValueOnce('token-a')
            .mockResolvedValueOnce('token-a')
            .mockResolvedValueOnce('token-b')

        requestMock
            .mockRejectedValueOnce(httpError(401))
            .mockRejectedValueOnce(httpError(401))

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        await expect(
            result.current({
                method: 'GET',
                url: '/auth/me',
            }),
        ).rejects.toThrow('Authentication session expired')

        expect(requestMock).toHaveBeenCalledTimes(2)
        expect(invalidateSessionMock).toHaveBeenCalledWith(
            'token-b',
        )
    })

    it('preserves the session when the API returns 403', async () => {
        requestMock.mockRejectedValueOnce(httpError(403))

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        await expect(
            result.current({
                method: 'GET',
                url: '/auth/me',
            }),
        ).rejects.toMatchObject({
            response: {
                status: 403,
            },
        })

        expect(requestMock).toHaveBeenCalledTimes(1)
        expect(invalidateSessionMock).not.toHaveBeenCalled()
    })

    it('blocks requests without an authenticated session', async () => {
        getAccessTokenMock.mockResolvedValueOnce(null)

        const { result } = renderHook(() =>
            useAuthenticatedRequest(),
        )

        await expect(
            result.current({
                method: 'GET',
                url: '/auth/me',
            }),
        ).rejects.toThrow('Authentication required')

        expect(requestMock).not.toHaveBeenCalled()
    })
})
