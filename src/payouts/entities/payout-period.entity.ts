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

@Entity('payout_periods')
export class PayoutPeriod {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) created_by!: string;

  @Column({ type: 'date' }) start_date!: string;

  @Column({ type: 'date' }) end_date!: string;

  @Column({ type: 'varchar', length: 10, default: 'open' })
  status!: 'open' | 'closed';

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
