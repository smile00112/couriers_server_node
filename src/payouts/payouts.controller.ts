import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { PayoutsService, PeriodsQuery } from './payouts.service';
import { CreatePayoutPeriodDto } from './dto/create-payout-period.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';
import {
  PaginatedPayoutPeriodsDto,
  PayoutPeriodResponseDto,
} from './dto/payout-period-response.dto';
import { PeriodSummaryResponseDto } from './dto/period-summary-response.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { PendingCouriersResponseDto } from './dto/pending-couriers-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('payout-reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payout-periods')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'Create a new payout period',
    operationId: 'createPayoutPeriod',
  })
  @ApiCreatedResponse({
    type: PayoutPeriodResponseDto,
    description: 'Period created',
  })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  createPayoutPeriod(
    @Request() req: AuthRequest,
    @Body() dto: CreatePayoutPeriodDto,
  ): Promise<PayoutPeriodResponseDto> {
    return this.payoutsService.createPeriod(req.user, dto);
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'List all payout periods for the tenant',
    operationId: 'listPayoutPeriods',
  })
  @ApiOkResponse({
    type: PaginatedPayoutPeriodsDto,
    description: 'Paginated list of periods',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', default: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', default: 20, maximum: 100 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['open', 'closed'] },
  })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  listPayoutPeriods(
    @Request() req: AuthRequest,
    @Query() query: PeriodsQuery,
  ): Promise<PaginatedPayoutPeriodsDto> {
    return this.payoutsService.listPeriods(req.user.ownerId, query);
  }

  @Post(':id/close')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'Close an open payout period',
    operationId: 'closePayoutPeriod',
  })
  @ApiOkResponse({
    type: PayoutPeriodResponseDto,
    description: 'Period closed',
  })
  @ApiNotFoundResponse({ description: 'Period not found or not in tenant' })
  @ApiConflictResponse({ description: 'Period is already closed' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  closePayoutPeriod(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayoutPeriodResponseDto> {
    return this.payoutsService.closePeriod(req.user.ownerId, id);
  }

  @Get(':id/summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'Get per-courier earnings summary for a period',
    operationId: 'getPayoutPeriodSummary',
  })
  @ApiOkResponse({
    type: PeriodSummaryResponseDto,
    description: 'Earnings summary',
  })
  @ApiNotFoundResponse({ description: 'Period not found or not in tenant' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  getPayoutPeriodSummary(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PeriodSummaryResponseDto> {
    return this.payoutsService.getPeriodSummary(req.user.ownerId, id);
  }

  @Post(':id/payouts')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'Mark a courier as paid within a closed period',
    operationId: 'recordPayout',
  })
  @ApiCreatedResponse({
    type: PayoutResponseDto,
    description: 'Payout recorded',
  })
  @ApiNotFoundResponse({ description: 'Period or courier not found in tenant' })
  @ApiConflictResponse({ description: 'Courier already paid in this period' })
  @ApiUnprocessableEntityResponse({ description: 'Period is not closed yet' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  recordPayout(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePayoutDto,
  ): Promise<PayoutResponseDto> {
    return this.payoutsService.recordPayout(req.user.ownerId, id, dto);
  }

  @Get(':id/pending')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({
    summary: 'List couriers with unpaid earnings in a closed period',
    operationId: 'getPendingCouriers',
  })
  @ApiOkResponse({
    type: PendingCouriersResponseDto,
    description: 'Unpaid couriers',
  })
  @ApiNotFoundResponse({ description: 'Period not found or not in tenant' })
  @ApiConflictResponse({ description: 'Period is still open' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  getPendingCouriers(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PendingCouriersResponseDto> {
    return this.payoutsService.getPendingCouriers(req.user.ownerId, id);
  }
}
