import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AcademicRecordsController } from './academic-records.controller';
import { AcademicRecordsService } from './academic-records.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [AcademicRecordsController],
  providers: [AcademicRecordsService],
  exports: [AcademicRecordsService],
})
export class AcademicRecordsModule {}
