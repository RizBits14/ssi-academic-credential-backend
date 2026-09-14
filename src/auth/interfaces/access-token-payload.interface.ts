import { UserRole } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
