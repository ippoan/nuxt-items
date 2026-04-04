import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock h3/nitro auto-imports ---
const mockGetRouterParam = vi.fn()
const mockGetHeader = vi.fn()
const mockSetHeader = vi.fn()
const mockReadRawBody = vi.fn()
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.message)
  ;(err as any).statusCode = opts.statusCode
  return err
})
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getHeader', mockGetHeader)
vi.stubGlobal('setHeader', mockSetHeader)
vi.stubGlobal('readRawBody', mockReadRawBody)
vi.stubGlobal('createError', mockCreateError)
vi.stubGlobal('defineEventHandler', (handler: Function) => handler)

const handler = (await import('../../server/api/grpc/[...path]')).default as any

describe('grpc-proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws 500 when GRPC_PROXY_SERVICE binding is not available', async () => {
    mockGetRouterParam.mockReturnValue('some/path')
    const event = { method: 'POST', context: {} }
    await expect(handler(event)).rejects.toThrow('GRPC_PROXY_SERVICE binding not available')
    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'GRPC_PROXY_SERVICE binding not available',
    })
  })

  it('throws 500 when cloudflare.env exists but no GRPC_PROXY_SERVICE', async () => {
    mockGetRouterParam.mockReturnValue('some/path')
    const event = { method: 'POST', context: { cloudflare: { env: {} } } }
    await expect(handler(event)).rejects.toThrow('GRPC_PROXY_SERVICE binding not available')
  })

  it('forwards POST request with all headers and body', async () => {
    mockGetRouterParam.mockReturnValue('my.service/Method')

    const headerMap: Record<string, string> = {
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
      'connect-protocol-version': '1',
      'x-auth-token': 'my-token',
      'x-organization-id': 'org-123',
    }
    mockGetHeader.mockImplementation((_event: any, name: string) => headerMap[name])
    mockReadRawBody.mockResolvedValue(new Uint8Array([1, 2, 3]))

    const mockResponseHeaders = new Headers({
      'content-type': 'application/grpc-web+proto',
      'grpc-status': '0',
    })
    const mockResponseBody = 'response-body'
    const mockServiceFetch = vi.fn().mockResolvedValue({
      headers: mockResponseHeaders,
      body: mockResponseBody,
    })

    const event = {
      method: 'POST',
      context: {
        cloudflare: {
          env: {
            GRPC_PROXY_SERVICE: { fetch: mockServiceFetch },
          },
        },
      },
    }

    const result = await handler(event)

    expect(mockServiceFetch).toHaveBeenCalledWith(
      'https://cf-grpc-proxy.workers.dev/my.service/Method',
      expect.objectContaining({
        method: 'POST',
        body: new Uint8Array([1, 2, 3]),
      }),
    )

    // Verify headers were set on the request
    const fetchCall = mockServiceFetch.mock.calls[0]
    const sentHeaders = fetchCall[1].headers as Headers
    expect(sentHeaders.get('Content-Type')).toBe('application/grpc-web+proto')
    expect(sentHeaders.get('X-Grpc-Web')).toBe('1')
    expect(sentHeaders.get('Connect-Protocol-Version')).toBe('1')
    expect(sentHeaders.get('x-auth-token')).toBe('my-token')
    expect(sentHeaders.get('x-organization-id')).toBe('org-123')

    // Verify response headers were set
    expect(mockSetHeader).toHaveBeenCalledWith(event, 'content-type', 'application/grpc-web+proto')
    expect(mockSetHeader).toHaveBeenCalledWith(event, 'grpc-status', '0')

    expect(result).toBe(mockResponseBody)
  })

  it('forwards GET request without body', async () => {
    mockGetRouterParam.mockReturnValue('my.service/Check')
    mockGetHeader.mockReturnValue(undefined)

    const mockServiceFetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
      body: null,
    })

    const event = {
      method: 'GET',
      context: {
        cloudflare: {
          env: {
            GRPC_PROXY_SERVICE: { fetch: mockServiceFetch },
          },
        },
      },
    }

    const result = await handler(event)

    expect(mockServiceFetch).toHaveBeenCalledWith(
      'https://cf-grpc-proxy.workers.dev/my.service/Check',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
      }),
    )
    expect(mockReadRawBody).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('handles empty path', async () => {
    mockGetRouterParam.mockReturnValue('')
    mockGetHeader.mockReturnValue(undefined)

    const mockServiceFetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
      body: null,
    })

    const event = {
      method: 'GET',
      context: {
        cloudflare: {
          env: {
            GRPC_PROXY_SERVICE: { fetch: mockServiceFetch },
          },
        },
      },
    }

    await handler(event)

    expect(mockServiceFetch).toHaveBeenCalledWith(
      'https://cf-grpc-proxy.workers.dev/',
      expect.anything(),
    )
  })

  it('handles undefined path (getRouterParam returns undefined)', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    mockGetHeader.mockReturnValue(undefined)

    const mockServiceFetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
      body: null,
    })

    const event = {
      method: 'GET',
      context: {
        cloudflare: {
          env: {
            GRPC_PROXY_SERVICE: { fetch: mockServiceFetch },
          },
        },
      },
    }

    await handler(event)

    expect(mockServiceFetch).toHaveBeenCalledWith(
      'https://cf-grpc-proxy.workers.dev/',
      expect.anything(),
    )
  })

  it('skips headers that are not present', async () => {
    mockGetRouterParam.mockReturnValue('path')
    // Only content-type is set, others are undefined
    mockGetHeader.mockImplementation((_event: any, name: string) => {
      if (name === 'content-type') return 'application/json'
      return undefined
    })
    mockReadRawBody.mockResolvedValue(new Uint8Array([]))

    const mockServiceFetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
      body: null,
    })

    const event = {
      method: 'POST',
      context: {
        cloudflare: {
          env: {
            GRPC_PROXY_SERVICE: { fetch: mockServiceFetch },
          },
        },
      },
    }

    await handler(event)

    const fetchCall = mockServiceFetch.mock.calls[0]
    const sentHeaders = fetchCall[1].headers as Headers
    expect(sentHeaders.get('Content-Type')).toBe('application/json')
    expect(sentHeaders.get('X-Grpc-Web')).toBeNull()
    expect(sentHeaders.get('Connect-Protocol-Version')).toBeNull()
    expect(sentHeaders.get('x-auth-token')).toBeNull()
    expect(sentHeaders.get('x-organization-id')).toBeNull()
  })
})
