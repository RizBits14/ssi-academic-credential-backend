import { describe, expect, it, jest } from '@jest/globals';
import type Redis from 'ioredis';

import { RedisService } from './redis.service';

describe('RedisService', () => {
  const client = {
    set: jest.fn<(...args: unknown[]) => Promise<'OK'>>(),
    get: jest.fn<(...args: unknown[]) => Promise<string | null>>(),
    del: jest.fn<(...args: unknown[]) => Promise<number>>(),
    ping: jest.fn<() => Promise<string>>(),
    quit: jest.fn<() => Promise<'OK'>>(),
    status: 'ready',
  };

  const service = new RedisService(client as unknown as Redis);

  it('should store JSON with TTL', async () => {
    client.set.mockResolvedValue('OK');

    await service.setJson(
      'test-key',
      {
        hello: 'world',
      },
      300,
    );

    expect(client.set).toHaveBeenCalledWith(
      'test-key',
      '{"hello":"world"}',
      'EX',
      300,
    );
  });

  it('should read JSON', async () => {
    client.get.mockResolvedValue('{"hello":"world"}');

    const result = await service.getJson<{
      hello: string;
    }>('test-key');

    expect(result).toEqual({
      hello: 'world',
    });
  });

  it('should return null when key does not exist', async () => {
    client.get.mockResolvedValue(null);

    const result = await service.getJson('missing-key');

    expect(result).toBeNull();
  });

  it('should delete a key', async () => {
    client.del.mockResolvedValue(1);

    await service.delete('test-key');

    expect(client.del).toHaveBeenCalledWith('test-key');
  });
});
