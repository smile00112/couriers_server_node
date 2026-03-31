import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';
import { Courier } from './courier.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('courier_location_history')
export class CourierLocationHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) courier_id!: string;

  @ManyToOne(() => Courier)
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;

  @Column({ type: 'uuid', nullable: true }) order_id!: string | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order!: Order | null;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) lat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) lng!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  distance_meters!: number;

  @CreateDateColumn() recorded_at!: Date;
}
