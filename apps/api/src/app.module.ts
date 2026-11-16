import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Connection } from 'mongoose';
import { AuthGuard, Public } from './common/auth';
import { DbModule } from './db/db.module';
import { AccountModule } from './modules/account';
import { AdminModule } from './modules/admin';
import { AuthModule } from './modules/auth';
import { CatalogModule } from './modules/catalog';
import { FilesModule } from './modules/files';
import { FinanceModule } from './modules/finance';
import { NotifyModule } from './modules/notify';
import { OrdersModule } from './modules/orders';

@Controller('health')
class HealthController {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'otd-api', db: this.conn.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    JwtModule.register({ global: true }),
    DbModule,
    NotifyModule,
    FilesModule,
    AuthModule,
    AccountModule,
    CatalogModule,
    FinanceModule,
    OrdersModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
