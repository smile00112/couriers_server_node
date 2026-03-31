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
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { LocationThrottleGuard } from './guards/location-throttle.guard';
import { CourierTrackingService } from './courier-tracking.service';
import { SubmitLocationDto } from './dto/submit-location.dto';
import {
  LocationResponseDto,
  RouteHistoryResponseDto,
} from './dto/location-history-response.dto';
import { PaginatedRouteHistoryDto } from './dto/route-history-list.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('courier-tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CourierTrackingController {
  constructor(private readonly courierTrackingService: CourierTrackingService) {}

  @Post('couriers/location')
  @Roles(UserRole.COURIER)
  @UseGuards(LocationThrottleGuard)
  @Throttle({ default: { ttl: 5000, limit: 1 } })
  @ApiOperation({ summary: 'Submit current GPS location', operationId: 'submitLocation' })
  @ApiOkResponse({ type: LocationResponseDto, description: 'Location recorded successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request body (missing required fields)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted for this action' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded — courier is submitting locations too frequently' })
  submitLocation(
    @Body() dto: SubmitLocationDto,
    @Request() req: AuthRequest,
  ): Promise<LocationResponseDto> {
    return this.courierTrackingService.submitLocation(dto, req.user);
  }

  @Get('api/v1/route-history')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'List route history entries', operationId: 'listRouteHistory' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'courier_id', required: false, type: String })
  @ApiQuery({ name: 'order_id', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOkResponse({ type: PaginatedRouteHistoryDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  getRouteHistoryList(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('courier_id') courier_id: string | undefined,
    @Query('order_id') order_id: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Request() req: AuthRequest,
  ): Promise<PaginatedRouteHistoryDto> {
    return this.courierTrackingService.getRouteHistoryList(
      req.user.ownerId,
      Number(page),
      Number(limit),
      { courier_id, order_id, from, to },
    );
  }

  @Get('orders/:id/route')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Get route history for a delivery', operationId: 'getOrderRoute' })
  @ApiOkResponse({ type: RouteHistoryResponseDto, description: 'Route history for the order' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Role not permitted for this action' })
  @ApiNotFoundResponse({ description: 'Order not found or not in tenant' })
  getOrderRoute(
    @Param('id') id: string,
    @Request() req: AuthRequest,
  ): Promise<RouteHistoryResponseDto> {
    return this.courierTrackingService.getOrderRoute(id, req.user.ownerId);
  }
}
