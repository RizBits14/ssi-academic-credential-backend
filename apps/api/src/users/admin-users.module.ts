import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from './users.module';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminUsersController],
})
export class AdminUsersModule {}
