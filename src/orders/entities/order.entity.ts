import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';
import { Client } from '../../clients/entities/client.entity';
import { Courier } from '../../couriers/entities/courier.entity';
import { OrderItem } from './order-item.entity';
import { OrderAuditEntry } from './order-audit-entry.entity';

@Entity('orders')
@Unique(['owner_id', 'order_number'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'uuid' }) client_id!: string;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @Column({ length: 100 }) order_number!: string;

  @Column({ length: 50, default: 'created' }) status!: string;

  @Column({ type: 'text' }) pickup_address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) pickup_lat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) pickup_lng!: number;

  @Column({ type: 'text' }) dropoff_address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) dropoff_lat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 }) dropoff_lng!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) delivery_fee!: number;

  @Column({ type: 'text', nullable: true }) callback_url!: string | null;

  @Column({ type: 'uuid', nullable: true }) courier_id!: string | null;

  @ManyToOne(() => Courier, { nullable: true, eager: false })
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier | null;

  @Column({ type: 'timestamptz', nullable: true }) assigned_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true }) picked_up_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true }) in_delivery_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true }) completed_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true }) cancelled_at!: Date | null;

  @Column({ type: 'uuid' }) created_by_id!: string;

  @Column({ length: 50 }) created_by_role!: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items!: OrderItem[];

  @OneToMany(() => OrderAuditEntry, (entry) => entry.order, {
    cascade: ['insert'],
  })
  audit_entries!: OrderAuditEntry[];

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
