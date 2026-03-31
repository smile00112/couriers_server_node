import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginatedUsersDto, UserResponseDto } from './dto/user-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('users-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'List staff users for tenant', operationId: 'listUsers' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedUsersDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req: AuthRequest,
  ): Promise<PaginatedUsersDto> {
    return this.usersService.findAll(req.user.ownerId, Number(page), Number(limit));
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create staff user', operationId: 'createUser' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Only owners can create users' })
  create(
    @Body() dto: CreateUserDto,
    @Request() req: AuthRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.create(req.user.ownerId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update staff user', operationId: 'updateUser' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Only owners can update users' })
  @ApiNotFoundResponse({ description: 'User not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: AuthRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.update(req.user.ownerId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staff user', operationId: 'deleteUser' })
  @ApiNoContentResponse({ description: 'User deleted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Only owners can delete users, cannot delete self' })
  @ApiNotFoundResponse({ description: 'User not found' })
  remove(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    return this.usersService.remove(req.user.ownerId, id, req.user.userId);
  }
}
