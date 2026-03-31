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
import { Courier } from './courier.entity';

@Entity('courier_shifts')
export class CourierShift {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) courier_id!: string;

  @ManyToOne(() => Courier)
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;

  @Column({ length: 20, default: 'open' }) status!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' }) started_at!: Date;

  @Column({ type: 'timestamptz', nullable: true }) ended_at!: Date | null;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
