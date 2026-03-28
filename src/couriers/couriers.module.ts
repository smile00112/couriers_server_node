import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Courier } from './entities/courier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Courier])],
  exports: [TypeOrmModule],
})
export class CouriersModule {}
