import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MODELS } from './schemas';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/otd' }),
    }),
    MongooseModule.forFeature(MODELS),
  ],
  providers: [SettingsService],
  exports: [MongooseModule, SettingsService],
})
export class DbModule {}
