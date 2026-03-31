import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Generic JWT guard for all authenticated roles (Owner, Manager, Operator, Courier).
 * Use this instead of CourierJwtGuard on endpoints that serve multiple roles.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
