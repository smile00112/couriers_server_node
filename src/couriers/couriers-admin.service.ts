import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Courier } from './entities/courier.entity';
import { CourierPosition } from './entities/courier-position.entity';
import { CourierShift } from './entities/courier-shift.entity';
import { UpdateCourierDto } from './dto/update-courier.dto';
import type {
  CourierAdminListItemDto,
  CourierAdminDetailDto,
  PaginatedCouriersDto,
} from './dto/courier-admin-response.dto';

@Injectable()
export class CouriersAdminService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(
    ownerId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginatedCouriersDto> {
    const repo = this.dataSource.getRepository(Courier);

    const qb = repo
      .createQueryBuilder('c')
      .where('c.owner_id = :ownerId', { ownerId })
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere(
        "(c.first_name ILIKE :q OR c.last_name ILIKE :q OR c.phone ILIKE :q)",
        { q: `%${search}%` },
      );
    }

    const [couriers, total] = await qb.getManyAndCount();

    const data: CourierAdminListItemDto[] = couriers.map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      status: c.status,
      login: c.login,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(ownerId: string, courierId: string): Promise<CourierAdminDetailDto> {
    const courier = await this.dataSource.getRepository(Courier).findOne({
      where: { id: courierId, owner_id: ownerId },
    });

    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    const position = await this.dataSource
      .getRepository(CourierPosition)
      .findOne({
        where: { courier_id: courierId, owner_id: ownerId },
        order: { recorded_at: 'DESC' },
      });

    const shift = await this.dataSource
      .getRepository(CourierShift)
      .findOne({
        where: { courier_id: courierId, owner_id: ownerId, status: 'open' },
        order: { started_at: 'DESC' },
      });

    const now = new Date();
    const elapsedMinutes = shift
      ? Math.floor((now.getTime() - shift.started_at.getTime()) / 60000)
      : 0;

    return {
      id: courier.id,
      first_name: courier.first_name,
      last_name: courier.last_name,
      phone: courier.phone,
      status: courier.status,
      login: courier.login,
      telegram_chat_id: courier.telegram_chat_id,
      created_at: courier.created_at.toISOString(),
      updated_at: courier.updated_at.toISOString(),
      current_position: position
        ? {
            lat: Number(position.lat),
            lng: Number(position.lng),
            recorded_at: position.recorded_at.toISOString(),
          }
        : null,
      current_shift: shift
        ? {
            id: shift.id,
            status: shift.status,
            started_at: shift.started_at.toISOString(),
            elapsed_minutes: elapsedMinutes,
          }
        : null,
    };
  }

  async update(
    ownerId: string,
    courierId: string,
    dto: UpdateCourierDto,
  ): Promise<CourierAdminDetailDto> {
    const repo = this.dataSource.getRepository(Courier);
    const courier = await repo.findOne({ where: { id: courierId, owner_id: ownerId } });

    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    Object.assign(courier, dto);
    await repo.save(courier);

    return this.findOne(ownerId, courierId);
  }
}
