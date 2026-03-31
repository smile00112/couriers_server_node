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

@Entity('courier_positions')
export class CourierPosition {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) courier_id!: string;

  @ManyToOne(() => Courier)
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) lat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) lng!: number;

  @Column({ type: 'timestamptz' }) recorded_at!: Date;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
