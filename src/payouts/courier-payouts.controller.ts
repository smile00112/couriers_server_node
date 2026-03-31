import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import {
  PayoutsService,
  EarningsQuery,
  PayoutsHistoryQuery,
} from './payouts.service';
import { PaginatedCourierEarningsDto } from './dto/courier-earnings-response.dto';
import { PaginatedCourierPayoutsDto } from './dto/courier-payouts-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('payout-reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('couriers/me')
export class CourierPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('earnings')
  @Roles(UserRole.COURIER)
  @ApiOperation({
    summary: "Get courier's own paginated earnings history",
    operationId: 'getCourierEarnings',
  })
  @ApiOkResponse({
    type: PaginatedCourierEarningsDto,
    description: 'Paginated earnings list',
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
    name: 'from',
    required: false,
    schema: { type: 'string', format: 'date' },
  })
  @ApiQuery({
    name: 'to',
    required: false,
    schema: { type: 'string', format: 'date' },
  })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getCourierEarnings(
    @Request() req: AuthRequest,
    @Query() query: EarningsQuery,
  ): Promise<PaginatedCourierEarningsDto> {
    return this.payoutsService.getCourierEarnings(
      req.user.userId,
      req.user.ownerId,
      query,
    );
  }

  @Get('payouts')
  @Roles(UserRole.COURIER)
  @ApiOperation({
    summary: "Get courier's own payout history",
    operationId: 'getCourierPayoutHistory',
  })
  @ApiOkResponse({
    type: PaginatedCourierPayoutsDto,
    description: 'Paginated payout records',
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
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getCourierPayoutHistory(
    @Request() req: AuthRequest,
    @Query() query: PayoutsHistoryQuery,
  ): Promise<PaginatedCourierPayoutsDto> {
    return this.payoutsService.getCourierPayouts(
      req.user.userId,
      req.user.ownerId,
      query,
    );
  }
}
