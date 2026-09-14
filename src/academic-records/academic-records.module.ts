import { Module } from '@nestjs/common';
import { AcademicRecordsService } from './academic-records.service';

@Module({
  providers: [AcademicRecordsService],
  exports: [AcademicRecordsService],
})
export class AcademicRecordsModule {}
