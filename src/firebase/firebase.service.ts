import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const disabled = this.config.get<string>('FCM_DISABLED') === 'true';
    if (disabled) {
      this.logger.warn('FCM is disabled (FCM_DISABLED=true). Push notifications will be no-ops.');
      return;
    }

    const serviceAccountJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set. FCM push notifications will be skipped.',
      );
      return;
    }

    if (admin.apps.length > 0) {
      this.app = admin.apps[0]!;
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountJson, 'base64').toString('utf8'),
      ) as admin.ServiceAccount;
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log('Firebase Admin SDK initialized.');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin SDK', err);
    }
  }

  getMessaging(): admin.messaging.Messaging | null {
    if (!this.app) return null;
    return this.app.messaging();
  }
}
