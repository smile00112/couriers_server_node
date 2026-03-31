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

  @Column({
    type: 'enum',
    enum: CourierStatus,
    default: CourierStatus.UNAVAILABLE,
  })
  status!: CourierStatus;

  @Column({ nullable: true }) fcm_token!: string;

  @Column({ nullable: true, type: 'varchar' }) telegram_chat_id!: string | null;

  @Column({ length: 100, nullable: true }) login!: string | null;

  @Column({ length: 255, nullable: true, select: false }) password_hash!:
    | string
    | null;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
