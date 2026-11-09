import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class HashingService {
  sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
