import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { OrderLifecycleService } from './order-lifecycle.service';
import {
  CancelOrderDto,
  OrderLifecycleResponseDto,
} from './dto/order-lifecycle-response.dto';
import { AvailableOrdersListDto } from './dto/available-orders-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('orders-lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrderLifecycleController {
  constructor(private readonly orderLifecycleService: OrderLifecycleService) {}

  @Get('available')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'List available (unclaimed) orders for the courier tenant' })
  @ApiOkResponse({ type: AvailableOrdersListDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getAvailableOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: AuthRequest,
  ): Promise<AvailableOrdersListDto> {
    return this.orderLifecycleService.getAvailableOrders(
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined },
      req!.user.ownerId,
    );
  }

  @Post(':id/claim')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Claim an available order (created → assigned)' })
  @ApiOkResponse({ type: OrderLifecycleResponseDto })
  @ApiConflictResponse({ description: 'Order already claimed or courier has active order' })
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  claim(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<OrderLifecycleResponseDto> {
    return this.orderLifecycleService.claim(id, req.user);
  }

  @Post(':id/pickup')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Mark order as picked up (assigned → picked_up)' })
  @ApiOkResponse({ type: OrderLifecycleResponseDto })
  @ApiUnprocessableEntityResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  pickup(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<OrderLifecycleResponseDto> {
    return this.orderLifecycleService.advanceStatus(id, 'picked_up', req.user);
  }

  @Post(':id/start-delivery')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Mark order as in delivery (picked_up → in_delivery)' })
  @ApiOkResponse({ type: OrderLifecycleResponseDto })
  @ApiUnprocessableEntityResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  startDelivery(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<OrderLifecycleResponseDto> {
    return this.orderLifecycleService.advanceStatus(id, 'in_delivery', req.user);
  }

  @Post(':id/complete')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Complete the order (in_delivery → completed)' })
  @ApiOkResponse({ type: OrderLifecycleResponseDto })
  @ApiUnprocessableEntityResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  complete(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<OrderLifecycleResponseDto> {
    return this.orderLifecycleService.advanceStatus(id, 'completed', req.user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Cancel an order (any non-terminal → cancelled)' })
  @ApiOkResponse({ type: OrderLifecycleResponseDto })
  @ApiUnprocessableEntityResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Request() req: AuthRequest,
  ): Promise<OrderLifecycleResponseDto> {
    return this.orderLifecycleService.cancel(id, dto?.reason, req.user);
  }
}
