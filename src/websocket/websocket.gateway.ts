/* eslint-disable @typescript-eslint/no-unused-vars */
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({ cors: { origin: '*' } })
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly prisma: PrismaService) {}

  // Handle connection
  handleConnection(client: Socket) {
    console.log(`Client connected`);
  }

  // Handle disconnection
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected`);
  }

  @SubscribeMessage('locationUpdate')
  async handleLocationUpdate(data: any) {
    const { deviceName, os, latitude, longitude, reverseData, eventType } = data;
    let { deviceId } = data;

    console.log('====================================');
    console.log(JSON.stringify(data), 'dari devices');
    console.log('====================================');

    // Generate deviceId jika undefined
    if (!deviceId) {
      deviceId = uuidv4();
      console.log(`Generated new deviceId: ${deviceId}`);
    }

    // Upsert untuk Device (create jika tidak ada, update jika ada)
    await this.prisma.device.upsert({
      where: { id: deviceId },
      update: { name: deviceName || 'Unknown Device', os: os || 'Unknown OS' },
      create: {
        id: deviceId,
        name: deviceName || 'Unknown Device',
        os: os || 'Unknown OS',
      },
    });

    // Cari timeline aktif (endTime null)
    let timeline = await this.prisma.timeLine.findFirst({
      where: {
        deviceId,
        endTime: null,
      },
    });

    // Jika eventType START, buat timeline baru jika tidak ada
    if (eventType === 'START') {
      if (!timeline) {
        timeline = await this.prisma.timeLine.create({
          data: {
            deviceId,
            startTime: new Date(),
          },
        });
        console.log(`New timeline started for device ${deviceId}`);
      }
    }

    // Jika eventType FINISH, tutup timeline aktif
    else if (eventType === 'FINISH') {
      if (timeline) {
        await this.prisma.timeLine.update({
          where: { id: timeline.id },
          data: { endTime: new Date() },
        });
        console.log(`Timeline ended for device ${deviceId}`);
      }
    }

    // Insert data lokasi
    await this.prisma.location.create({
      data: {
        deviceId,
        latitude,
        longitude,
        reverseData,
        eventType,
        timeLineId: timeline?.id || null,
      },
    });

    // Emit data terbaru ke client
    this.server.emit('locationUpdate', {
      deviceId,
      latitude,
      longitude,
      reverseData,
    });
  }

  @SubscribeMessage('activeTimeline')
  async timelineActive(client: Socket) {
    console.log('Event "activeTimeline" diterima');

    try {
      const data = await this.prisma.timeLine.findMany({
        where: {
          endTime: null,
        },
        include: { Device: true },
        orderBy: { createdAt: 'desc' },
      });

      if (data.length === 0) {
        const message = JSON.stringify({
          event: 'activeTimeline',
          message: 'No activity yet!!',
        });

        client.send(message);
        // this.server.clients.forEach((client: any) => {
        //   client.send(message);
        // });
      } else {
        const message = JSON.stringify({
          event: 'activeTimeline',
          data,
        });

        client.send(message);
        // this.server.clients.forEach((client: any) => {
        //   client.send(message);
        // });
      }
    } catch (error) {
      const errorMessage = JSON.stringify({
        event: 'activeTimeline',
        message: 'Failed to fetch ongoing timelines',
      });

      client.send(errorMessage);
      // this.server.clients.forEach((client: any) => {
      //   client.send(errorMessage);
      // });
    }
  }

  @SubscribeMessage('detailActivity')
  async detailActivity(client: Socket, data: any) {
    console.log('Event "detailActivity" diterima');
    console.log('Payload diterima:', data);

    try {
      const datas = await this.prisma.location.findMany({
        where: {
          timeLineId: data.timelineId,
        },

        orderBy: { createdAt: 'asc' },
      });
      const message = JSON.stringify({
        event: 'detailActivity',
        datas,
      });
      client.send(message);
    } catch (error) {
      const errorMessage = JSON.stringify({
        event: 'detailActivity',
        message: 'Failed to fetch detail timelines',
      });

      client.send(errorMessage);
    }
  }
}
