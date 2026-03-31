import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderDetailResponseDto,
  OrderListResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Create a new order' })
  @ApiCreatedResponse({ type: OrderResponseDto, description: 'Order created' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiConflictResponse({ description: 'Duplicate order_number (includes existingOrderId)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not allowed' })
  create(
    @Body() dto: CreateOrderDto,
    @Request() req: AuthRequest,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(dto, req.user);
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'List orders for tenant (paginated)' })
  @ApiOkResponse({ type: OrderListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not allowed' })
  findAll(
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req: AuthRequest,
  ): Promise<OrderListResponseDto> {
    return this.ordersService.findAll(
      {
        status,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      req.user.ownerId,
    );
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Get order by ID (includes items and audit log)' })
  @ApiOkResponse({ type: OrderDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not allowed' })
  findOne(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<OrderDetailResponseDto> {
    return this.ordersService.findOne(id, req.user.ownerId);
  }
}
