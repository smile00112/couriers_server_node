import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CourierJwtGuard extends AuthGuard('jwt') {}
