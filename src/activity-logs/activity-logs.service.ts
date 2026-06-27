import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivityLogContext,
  CreateActivityLogInput,
} from './activity-logs.types';
import { ListActivityLogsQueryDto } from './dto/activity-log.dto';

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizeMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (metadata === undefined) {
      return undefined;
    }

    if (metadata === null) {
      return Prisma.JsonNull;
    }

    try {
      return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
    } catch {
      return {
        serializationError: true,
      } as Prisma.InputJsonValue;
    }
  }

  getRequestContext(request: any): ActivityLogContext {
    const forwardedFor = request?.headers?.['x-forwarded-for'];
    const ipAddress =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim()
        : request?.ip || request?.socket?.remoteAddress || null;

    return {
      actorUserId: request?.user?.id || null,
      actorEmail: request?.user?.email || null,
      actorName: request?.user?.name || null,
      ipAddress,
      userAgent: request?.headers?.['user-agent'] || null,
      method: request?.method || null,
      path: request?.originalUrl || request?.url || null,
    };
  }

  async log(input: CreateActivityLogInput) {
    try {
      await this.prisma.activityLog.create({
        data: {
          actorUserId: input.context?.actorUserId || null,
          action: input.action,
          module: input.module,
          entityType: input.entityType || null,
          entityId: input.entityId || null,
          status: input.status,
          message: input.message || null,
          metadata: this.sanitizeMetadata({
            ...(input.metadata || {}),
            actorEmail: input.context?.actorEmail || null,
            actorName: input.context?.actorName || null,
          }),
          ipAddress: input.context?.ipAddress || null,
          userAgent: input.context?.userAgent || null,
          method: input.context?.method || null,
          path: input.context?.path || null,
        },
      });
    } catch (error) {
      console.error('Failed to write activity log:', error);
    }
  }

  async findAll(query: ListActivityLogsQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};

    if (query.module) {
      where.module = query.module;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { module: { contains: query.search, mode: 'insensitive' } },
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
        { message: { contains: query.search, mode: 'insensitive' } },
        {
          actor: {
            is: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          actor: {
            is: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
