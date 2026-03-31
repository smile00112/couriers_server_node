import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { StaffUser } from './entities/staff-user.entity';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { PaginatedUsersDto, UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(StaffUser)
    private readonly usersRepo: Repository<StaffUser>,
  ) {}

  async findAll(ownerId: string, page: number, limit: number): Promise<PaginatedUsersDto> {
    const [users, total] = await this.usersRepo.findAndCount({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: users.map(this.toDto),
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async create(ownerId: string, dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      owner_id: ownerId,
      name: dto.name,
      email: dto.email,
      role: dto.role as StaffUser['role'],
      password_hash,
    });

    const saved = await this.usersRepo.save(user);
    return this.toDto(saved);
  }

  async update(ownerId: string, userId: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepo.findOne({ where: { id: userId, owner_id: ownerId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, dto);
    const saved = await this.usersRepo.save(user);
    return this.toDto(saved);
  }

  async remove(ownerId: string, userId: string, requesterId: string): Promise<void> {
    if (userId === requesterId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId, owner_id: ownerId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersRepo.remove(user);
  }

  private toDto(user: StaffUser): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at.toISOString(),
    };
  }
}
