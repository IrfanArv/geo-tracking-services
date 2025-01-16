import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebsocketModule } from './websocket/websocket.module';
import { PrismaModule } from './prisma/prisma.module';
import { TimelineModule } from './timeline/timeline.module';

@Module({
  imports: [WebsocketModule, PrismaModule, TimelineModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
