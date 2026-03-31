import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';
import { Courier } from '../../couriers/entities/courier.entity';
import { PayoutPeriod } from './payout-period.entity';

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) payout_period_id!: string;

  @ManyToOne(() => PayoutPeriod)
  @JoinColumn({ name: 'payout_period_id' })
  payout_period!: PayoutPeriod;

  @Column({ type: 'uuid' }) courier_id!: string;

  @ManyToOne(() => Courier)
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount!: number;

  @Column({ type: 'text', nullable: true }) reference_note!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' }) paid_at!: Date;

  @CreateDateColumn() created_at!: Date;
}
