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

export enum StaffUserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  ORDER_OPERATOR = 'order_operator',
}

@Entity('staff_users')
export class StaffUser {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ length: 255 }) name!: string;

  @Column({ length: 255, unique: true }) email!: string;

  @Column({
    type: 'enum',
    enum: StaffUserRole,
  })
  role!: StaffUserRole;

  @Column({ length: 255, select: false }) password_hash!: string;

  @CreateDateColumn() created_at!: Date;

  @UpdateDateColumn() updated_at!: Date;
}
