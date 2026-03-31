import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import { CouriersAdminService } from './couriers-admin.service';
import { UpdateCourierDto } from './dto/update-courier.dto';
import {
  CourierAdminDetailDto,
  PaginatedCouriersDto,
} from './dto/courier-admin-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('couriers-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/couriers')
export class CouriersAdminController {
  constructor(private readonly couriersAdminService: CouriersAdminService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'List couriers for tenant', operationId: 'listCouriersAdmin' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiOkResponse({ type: PaginatedCouriersDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search: string | undefined,
    @Request() req: AuthRequest,
  ): Promise<PaginatedCouriersDto> {
    return this.couriersAdminService.findAll(
      req.user.ownerId,
      Number(page),
      Number(limit),
      search,
    );
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Get courier detail', operationId: 'getCourierAdmin' })
  @ApiOkResponse({ type: CourierAdminDetailDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiNotFoundResponse({ description: 'Courier not found' })
  findOne(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<CourierAdminDetailDto> {
    return this.couriersAdminService.findOne(req.user.ownerId, id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update courier', operationId: 'updateCourierAdmin' })
  @ApiOkResponse({ type: CourierAdminDetailDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiNotFoundResponse({ description: 'Courier not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourierDto,
    @Request() req: AuthRequest,
  ): Promise<CourierAdminDetailDto> {
    return this.couriersAdminService.update(req.user.ownerId, id, dto);
  }
}
