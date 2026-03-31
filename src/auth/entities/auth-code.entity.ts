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
import { Courier } from '../../couriers/entities/courier.entity';

export enum DeliveryChannel {
  SMS = 'sms',
  TELEGRAM = 'telegram',
}

@Entity('courier_auth_codes')
export class AuthCode {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @Column({ type: 'uuid', nullable: true }) courier_id!: string | null;

  @Column({ length: 30 }) phone!: string;

  @Column({ length: 6 }) code!: string;

  @Column({ type: 'enum', enum: DeliveryChannel, default: DeliveryChannel.SMS })
  channel!: DeliveryChannel;

  @Column({ type: 'timestamp', nullable: true }) used_at!: Date | null;

  @Column({ type: 'timestamp' }) expires_at!: Date;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;

  @ManyToOne(() => Owner, { nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @ManyToOne(() => Courier, { nullable: true })
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier | null;
}
