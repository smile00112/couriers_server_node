import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';
import { Order } from './order.entity';

@Entity('order_audit_entries')
export class OrderAuditEntry {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) order_id!: string;

  @ManyToOne(() => Order, (order) => order.audit_entries)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ length: 50 }) action!: string;

  @Column({ type: 'uuid' }) actor_id!: string;

  @Column({ length: 50 }) actor_role!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn() created_at!: Date;
}
