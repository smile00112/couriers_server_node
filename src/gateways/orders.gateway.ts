import {
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../auth/enums/user-role.enum';

@WebSocketGateway({ cors: true })
export class OrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  onModuleInit() {
    this.logger.log('OrdersGateway initialized');
  }

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as Record<string, string>)['token'] ||
        (client.handshake.headers['authorization'] ?? '').replace(
          'Bearer ',
          '',
        );

      const payload = this.jwtService.verify<{
        sub: string;
        owner_id: string;
        role: string;
      }>(token);

      const ownerId = payload.owner_id;
      const role = payload.role;

      if (role === UserRole.COURIER) {
        void client.join(`tenant:${ownerId}:couriers`);
      } else {
        void client.join(`tenant:${ownerId}:staff`);
      }

      this.logger.log(
        `Client connected: ${client.id} role=${role} owner=${ownerId}`,
      );
    } catch {
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitOrderCreated(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('order:created', payload);
    this.server
      .to(`tenant:${ownerId}:couriers`)
      .emit('order:new_available', payload);
  }

  emitStatusChanged(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('order:status_changed', payload);
  }

  emitOrderCancelled(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('order:status_changed', payload);
    this.server
      .to(`tenant:${ownerId}:couriers`)
      .emit('order:cancelled', payload);
  }

  emitLocationUpdated(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('courier:location_updated', payload);
  }

  emitShiftOpened(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('courier:shift_opened', payload);
  }

  emitShiftClosed(ownerId: string, payload: object) {
    this.server
      .to(`tenant:${ownerId}:staff`)
      .emit('courier:shift_closed', payload);
  }
}
