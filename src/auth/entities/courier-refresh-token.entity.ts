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

@Entity('courier_refresh_tokens')
export class CourierRefreshToken {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) owner_id!: string;

  @Column({ type: 'uuid' }) courier_id!: string;

  @Column({ length: 64, unique: true }) token_hash!: string;

  @Column({ type: 'timestamp', nullable: true }) revoked_at!: Date | null;

  @Column({ type: 'timestamp' }) expires_at!: Date;

  @CreateDateColumn() created_at!: Date;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courier_id' })
  courier!: Courier;
}
