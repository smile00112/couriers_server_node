import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourierJwtGuard } from './guards/courier-jwt.guard';
import { CurrentCourier } from '../common/decorators/current-courier.decorator';
import { AuthUser } from './interfaces/jwt-payload.interface';
import { LogoutDto } from './dto/logout.dto';
import { CourierAuthService } from './courier-auth.service';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { PhoneNormalizePipe } from '../common/pipes/phone-normalize.pipe';
import { SendCodeThrottleGuard } from './guards/send-code-throttle.guard';

@ApiTags('courier-auth')
@Controller('api/v1/auth/courier')
export class CourierAuthController {
  constructor(private readonly authService: CourierAuthService) {}

  @Post('send-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SendCodeThrottleGuard)
  @ApiOperation({ summary: 'Request a one-time authentication code' })
  @ApiBody({ type: SendCodeDto })
  @ApiResponse({ status: 202, description: 'Code dispatched. No body.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid phone format or empty fields.',
  })
  @ApiResponse({
    status: 404,
    description: 'No courier found for this phone in the tenant.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  async sendCode(
    @Body() dto: SendCodeDto,
    @Body('phone', PhoneNormalizePipe) normalizedPhone: string,
  ): Promise<void> {
    await this.authService.sendCode({ ...dto, phone: normalizedPhone });
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a one-time code and obtain credentials' })
  @ApiBody({ type: VerifyCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful. Returns tokens.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing fields.' })
  @ApiResponse({
    status: 401,
    description: 'Code is invalid, expired, or already used.',
  })
  async verifyCode(
    @Body() dto: VerifyCodeDto,
    @Body('phone', PhoneNormalizePipe) normalizedPhone: string,
  ) {
    return this.authService.verifyCode({ ...dto, phone: normalizedPhone });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with username and password' })
  @ApiBody({ type: LoginPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful. Returns tokens.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing fields.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 429, description: 'Too many failed login attempts.' })
  async login(@Body() dto: LoginPasswordDto) {
    return this.authService.loginWithPassword(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CourierJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate the current session' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 204, description: 'Session invalidated. No body.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token.' })
  async logout(
    @CurrentCourier() user: AuthUser,
    @Body() dto: LogoutDto,
  ): Promise<void> {
    await this.authService.logout(user.userId, dto);
  }
}
