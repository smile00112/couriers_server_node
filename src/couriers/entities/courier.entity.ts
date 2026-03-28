import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';

export enum CourierStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
}

@Entity('couriers')
export class Courier {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column() first_name!: string;

  @Column() last_name!: string;

  @Column({ length: 30 }) phone!: string;

  @Column({ type: 'enum', enum: CourierStatus, default: CourierStatus.UNAVAILABLE })
  status!: CourierStatus;

  @Column({ nullable: true }) fcm_token!: string;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
