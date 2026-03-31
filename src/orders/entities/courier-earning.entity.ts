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
import { Order } from './order.entity';

@Entity('courier_earnings')
export class CourierEarning {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) courier_id!: string;

  @ManyToOne(() => Courier)
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;

  @Column({ type: 'uuid' }) order_id!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount!: number;

  @Column({ type: 'timestamptz' }) earned_at!: Date;

  @CreateDateColumn() created_at!: Date;
}
