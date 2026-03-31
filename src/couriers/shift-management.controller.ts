import {
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { ShiftManagementService } from './shift-management.service';
import {
  ActiveShiftsResponseDto,
  PaginatedShiftsDto,
  ShiftHistoryQueryDto,
  ShiftResponseDto,
} from './dto/shift-response.dto';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('shift-management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ShiftManagementController {
  constructor(private readonly shiftService: ShiftManagementService) {}

  // ----- Courier endpoints (static paths — must come before /:courierId routes) -----

  @Post('couriers/shift/open')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Open a new shift', operationId: 'openShift' })
  @ApiCreatedResponse({ type: ShiftResponseDto, description: 'Shift opened successfully' })
  @ApiConflictResponse({ description: 'Courier already has an open shift' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  openShift(@Request() req: AuthRequest): Promise<ShiftResponseDto> {
    return this.shiftService.openShift(req.user);
  }

  @Post('couriers/shift/close')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Close the current open shift', operationId: 'closeShift' })
  @ApiOkResponse({ type: ShiftResponseDto, description: 'Shift closed successfully' })
  @ApiConflictResponse({ description: 'No open shift to close' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  closeShift(@Request() req: AuthRequest): Promise<ShiftResponseDto> {
    return this.shiftService.closeShift(req.user);
  }

  @Get('couriers/shift/current')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: "Get courier's current open shift", operationId: 'getCurrentShift' })
  @ApiOkResponse({ description: 'Current shift or null', type: ShiftResponseDto })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getCurrentShift(@Request() req: AuthRequest): Promise<ShiftResponseDto | null> {
    return this.shiftService.getCurrentShift(req.user);
  }

  @Get('couriers/shift/history')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: "Get courier's own shift history", operationId: 'getOwnShiftHistory' })
  @ApiOkResponse({ type: PaginatedShiftsDto, description: 'Paginated shift history' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20, maximum: 100 } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getOwnShiftHistory(
    @Request() req: AuthRequest,
    @Query() query: ShiftHistoryQueryDto,
  ): Promise<PaginatedShiftsDto> {
    return this.shiftService.getOwnShiftHistory(req.user, query);
  }

  @Get('couriers/active-shifts')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'List all currently open shifts in tenant', operationId: 'getActiveShifts' })
  @ApiOkResponse({ type: ActiveShiftsResponseDto, description: 'List of active shifts' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getActiveShifts(@Request() req: AuthRequest): Promise<ActiveShiftsResponseDto> {
    return this.shiftService.getActiveShifts(req.user.ownerId);
  }

  // ----- Staff endpoint (parameterized path — MUST be last) -----

  @Get('couriers/:courierId/shifts')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)
  @ApiOperation({ summary: 'Get shift history for a specific courier', operationId: 'getCourierShifts' })
  @ApiOkResponse({ type: PaginatedShiftsDto, description: 'Paginated shift history for courier' })
  @ApiNotFoundResponse({ description: 'Courier not found or not in tenant' })
  @ApiForbiddenResponse({ description: 'Role not permitted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiParam({ name: 'courierId', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20, maximum: 100 } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date-time' } })
  getCourierShifts(
    @Param('courierId') courierId: string,
    @Request() req: AuthRequest,
    @Query() query: ShiftHistoryQueryDto,
  ): Promise<PaginatedShiftsDto> {
    return this.shiftService.getCourierShifts(courierId, req.user.ownerId, query);
  }
}
